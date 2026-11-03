# main.py - ESP32 + DHT22 -> servidor HTTP con JSON para el dashboard Ubaté Stories
# Respuesta en http://<IP_ESP32>/datos  ->  {"temp": 18.2, "hum": 64.5}

import network
import socket
import json
import time
import dht
from machine import Pin

# ---------- CONFIGURACIÓN ----------
SSID = "TU_WIFI"          # <-- nombre de tu red WiFi
PASSWORD = "TU_CLAVE"     # <-- contraseña de tu red WiFi
PIN_DHT = 4               # <-- pin de datos del DHT22
PUERTO = 80

sensor = dht.DHT22(Pin(PIN_DHT))
led = Pin(2, Pin.OUT)     # LED integrado de la mayoría de ESP32 (parpadea en cada petición)

# Cabeceras CORS: permiten que el dashboard (otra página) lea los datos
CORS = (
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
    "Access-Control-Allow-Headers: *\r\n"
)

# ---------- WIFI ----------
wlan = network.WLAN(network.STA_IF)


def conectar_wifi():
    wlan.active(True)
    if not wlan.isconnected():
        print("Conectando a", SSID, "...")
        wlan.connect(SSID, PASSWORD)
        intentos = 0
        while not wlan.isconnected() and intentos < 30:
            time.sleep(1)
            intentos += 1
    if wlan.isconnected():
        print("WiFi OK. IP de la ESP32:", wlan.ifconfig()[0])
        return True
    print("No se pudo conectar al WiFi")
    return False


# ---------- SENSOR ----------
# El DHT22 necesita mínimo 2 s entre lecturas, por eso se guarda la última
ultima = {"temp": None, "hum": None, "t": 0}


def leer_sensor():
    ahora = time.ticks_ms()
    if ultima["temp"] is None or time.ticks_diff(ahora, ultima["t"]) > 2000:
        sensor.measure()
        ultima["temp"] = sensor.temperature()
        ultima["hum"] = sensor.humidity()
        ultima["t"] = ahora
    return ultima["temp"], ultima["hum"]


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
    primera = peticion.split("\r\n")[0]          # ej: "GET /datos HTTP/1.1"
    partes = primera.split(" ")
    metodo = partes[0] if len(partes) > 0 else ""
    ruta = partes[1] if len(partes) > 1 else ""

    if metodo == "OPTIONS":                       # verificación previa del navegador
        responder(cl, 204, "No Content")
    elif ruta.startswith("/datos"):
        try:
            temp, hum = leer_sensor()
            responder(cl, 200, "OK", json.dumps({"temp": temp, "hum": hum}))
        except OSError:
            responder(cl, 500, "Error", json.dumps({"error": "fallo al leer el DHT22"}))
    else:
        responder(cl, 404, "Not Found", json.dumps({"error": "usa /datos"}))


# ---------- SERVIDOR ----------
def iniciar_servidor():
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", PUERTO))
    s.listen(3)
    s.settimeout(5)   # para poder revisar el WiFi aunque nadie consulte
    print("Servidor listo en http://{}/datos".format(wlan.ifconfig()[0]))
    return s


conectar_wifi()
servidor = iniciar_servidor()

while True:
    # Si se cae el WiFi, reconectar
    if not wlan.isconnected():
        print("WiFi caído, reconectando...")
        conectar_wifi()

    try:
        cl, direccion = servidor.accept()
    except OSError:
        continue      # timeout de 5 s sin peticiones: volver a revisar el WiFi

    try:
        cl.settimeout(3)
        led.value(1)
        atender(cl)
    except Exception as e:
        print("Error atendiendo petición:", e)
    finally:
        cl.close()
        led.value(0)