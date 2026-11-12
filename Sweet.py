# main.py - ESP32 + DHT -> servidor HTTP con JSON + pantalla LCD 16x2 (paralelo 4 bits)
# Respuesta en http://<IP_ESP32>/datos  ->  {"temp": 18.2, "hum": 64.5}

import network
import socket
import json
import time
import dht
from machine import Pin, time_pulse_us

# ---------- CONFIGURACIÓN ----------
SSID = "U-SALAS"
PASSWORD = "CAMBIA_ESTA_CLAVE"   # <-- pon aquí tu contraseña
PIN_DHT = 4
PUERTO = 80

# LCD 1602 en modo 4 bits (pines GPIO del ESP32)
LCD_RS = 14
LCD_E = 27
LCD_D4 = 26
LCD_D5 = 25
LCD_D6 = 33
LCD_D7 = 32

# Sensor ultrasónico HC-SR04 y relé
PIN_TRIG = 23
PIN_ECHO = 34            # solo entrada; conectar a través del divisor de voltaje
PIN_RELE = 21
RELE_ACTIVO_BAJO = True  # la mayoría de módulos relé se activan con 0 (LOW). Si te funciona al revés, pon False
DIST_ON = 30             # cm: si algo está más cerca que esto, prende el bombillo
DIST_OFF = 40            # cm: se apaga cuando se aleja más que esto (evita parpadeos)

sensor = dht.DHT11(Pin(PIN_DHT))   # si tu sensor es DHT22 cambia a dht.DHT22
led = Pin(2, Pin.OUT)

trig = Pin(PIN_TRIG, Pin.OUT, value=0)
echo = Pin(PIN_ECHO, Pin.IN)
rele = Pin(PIN_RELE, Pin.OUT)
estado = {"dist": None, "luz": False}


def poner_luz(encendida):
    estado["luz"] = encendida
    rele.value((not encendida) if RELE_ACTIVO_BAJO else encendida)


poner_luz(False)   # siempre arranca apagado


CORS = (
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
    "Access-Control-Allow-Headers: *\r\n"
)


# ---------- LCD 16x2 (HD44780) en modo 4 bits ----------
class LCD:
    def __init__(self, rs, e, d4, d5, d6, d7):
        self.rs = Pin(rs, Pin.OUT, value=0)
        self.e = Pin(e, Pin.OUT, value=0)
        self.datos = [Pin(p, Pin.OUT, value=0) for p in (d4, d5, d6, d7)]
        time.sleep_ms(50)
        self.rs.value(0)
        for _ in range(3):                # secuencia de inicio
            self._nibble(0x3)
            time.sleep_ms(5)
        self._nibble(0x2)                 # pasar a modo 4 bits
        self.cmd(0x28)                    # 2 líneas, 5x8
        self.cmd(0x0C)                    # pantalla encendida, sin cursor
        self.cmd(0x06)                    # cursor avanza a la derecha
        self.clear()

    def _nibble(self, n):
        for i, pin in enumerate(self.datos):
            pin.value((n >> i) & 1)
        self.e.value(1)
        time.sleep_us(5)
        self.e.value(0)
        time.sleep_us(60)

    def _send(self, b, rs):
        self.rs.value(rs)
        self._nibble(b >> 4)
        self._nibble(b & 0x0F)

    def cmd(self, c):
        self._send(c, 0)

    def clear(self):
        self.cmd(0x01)
        time.sleep_ms(3)

    def escribir(self, fila, texto):
        """Escribe en la fila 0 o 1, rellenando hasta 16 caracteres."""
        self.cmd(0x80 | (0x40 if fila else 0x00))
        for ch in "{:<16}".format(texto)[:16]:
            self._send(ord(ch), 1)


lcd = None
try:
    lcd = LCD(LCD_RS, LCD_E, LCD_D4, LCD_D5, LCD_D6, LCD_D7)
    lcd.escribir(0, "Ubate Stories")
    lcd.escribir(1, "Iniciando...")
except Exception as e:
    print("LCD no disponible:", e)


def mostrar(l1, l2=""):
    if lcd:
        try:
            lcd.escribir(0, l1)
            lcd.escribir(1, l2)
        except Exception as e:
            print("Error LCD:", e)


# ---------- WIFI ----------
wlan = network.WLAN(network.STA_IF)


def conectar_wifi():
    wlan.active(True)
    if not wlan.isconnected():
        print("Conectando a", SSID, "...")
        mostrar("Conectando WiFi", SSID)
        wlan.connect(SSID, PASSWORD)
        intentos = 0
        while not wlan.isconnected() and intentos < 30:
            time.sleep(1)
            intentos += 1
    if wlan.isconnected():
        ip = wlan.ifconfig()[0]
        print("WiFi OK. IP de la ESP32:", ip)
        mostrar("WiFi OK", ip)
        time.sleep(2)
        return True
    print("No se pudo conectar al WiFi")
    mostrar("Sin WiFi")
    return False


# ---------- SENSOR ----------
ultima = {"temp": None, "hum": None, "t": 0}


def leer_sensor():
    ahora = time.ticks_ms()
    if ultima["temp"] is None or time.ticks_diff(ahora, ultima["t"]) > 2000:
        sensor.measure()
        ultima["temp"] = sensor.temperature()
        ultima["hum"] = sensor.humidity()
        ultima["t"] = ahora
    return ultima["temp"], ultima["hum"]


# ---------- ULTRASÓNICO + RELÉ ----------
def medir_una_vez():
    trig.value(0)
    time.sleep_us(5)
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    t = time_pulse_us(echo, 1, 30000)    # máx 30 ms (~5 m)
    if t < 0:
        return None
    return t / 58.0                      # microsegundos -> cm


def medir_distancia():
    """Mediana de 3 lecturas para filtrar ruido. Devuelve cm o None."""
    lecturas = []
    for _ in range(3):
        d = medir_una_vez()
        if d is not None:
            lecturas.append(d)
        time.sleep_ms(20)
    if not lecturas:
        return None
    lecturas.sort()
    return lecturas[len(lecturas) // 2]


def controlar_luz():
    d = medir_distancia()
    estado["dist"] = d
    if d is None:
        return                           # sin lectura: mantiene el estado actual
    if d < DIST_ON and not estado["luz"]:
        poner_luz(True)
    elif d > DIST_OFF and estado["luz"]:
        poner_luz(False)


def actualizar_pantalla():
    d = estado["dist"]
    dtxt = "{}cm".format(int(d)) if d is not None else "--"
    linea2 = "D:{} Luz:{}".format(dtxt, "ON" if estado["luz"] else "OFF")
    try:
        temp, hum = leer_sensor()
        mostrar("T:{}C H:{}%".format(temp, hum), linea2)
    except OSError:
        mostrar("Error sensor DHT", linea2)


# ---------- RESPUESTAS HTTP ----------
def responder(cl, codigo, texto, cuerpo=""):
    cabecera = (
        "HTTP/1.1 {} {}\r\n"
        "Content-Type: application/json\r\n"
        "{}"
        "Connection: close\r\n\r\n"
    ).format(codigo, texto, CORS)
    cl.send(cabecera + cuerpo)


def atender(cl):
    peticion = cl.recv(1024).decode("utf-8", "ignore")
    primera = peticion.split("\r\n")[0]
    partes = primera.split(" ")
    metodo = partes[0] if len(partes) > 0 else ""
    ruta = partes[1] if len(partes) > 1 else ""

    if metodo == "OPTIONS":
        responder(cl, 204, "No Content")
    elif ruta.startswith("/datos"):
        try:
            temp, hum = leer_sensor()
            responder(cl, 200, "OK", json.dumps({"temp": temp, "hum": hum, "dist": estado["dist"], "luz": estado["luz"]}))
        except OSError:
            responder(cl, 500, "Error", json.dumps({"error": "fallo al leer el sensor"}))
    else:
        responder(cl, 404, "Not Found", json.dumps({"error": "usa /datos"}))


# ---------- SERVIDOR ----------
def iniciar_servidor():
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", PUERTO))
    s.listen(3)
    s.settimeout(0.3)   # sale del accept seguido para medir distancia y refrescar la pantalla
    print("Servidor listo en http://{}/datos".format(wlan.ifconfig()[0]))
    return s


conectar_wifi()
servidor = iniciar_servidor()
ultima_pantalla = 0

while True:
    if not wlan.isconnected():
        print("WiFi caído, reconectando...")
        conectar_wifi()

    controlar_luz()

    if time.ticks_diff(time.ticks_ms(), ultima_pantalla) > 2000:
        actualizar_pantalla()
        ultima_pantalla = time.ticks_ms()

    try:
        cl, direccion = servidor.accept()
    except OSError:
        continue

    try:
        cl.settimeout(3)
        led.value(1)
        atender(cl)
    except Exception as e:
        print("Error atendiendo petición:", e)
    finally:
        cl.close()
        led.value(0)