window.addEventListener("load", () => {
  console.log("San Andreas Dashboard iniciado.");

  // Quitar el banner de misión del DOM cuando termina su animación
  const mission = document.getElementById('mission');
  if (mission) setTimeout(() => mission.remove(), 4000);

  if (typeof Chart === 'undefined') {
    console.error("Chart.js no está cargado.");
    return;
  }

  // Estilo global de los gráficos (tipografía y colores del menú de SA)
  Chart.defaults.font.family = 'Changa';
  Chart.defaults.color = '#a89f8a';

  const SA = {
    green: '#2e8b3a',
    greenBright: '#5fd35f',
    orange: '#f0a83a',
    text: '#f1ead8',
    muted: '#a89f8a',
    grid: 'rgba(255, 255, 255, 0.08)'
  };

  const baseOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: SA.text, font: { family: 'Changa', weight: '600' } } }
    },
    scales: {
      x: { ticks: { color: SA.muted }, grid: { color: SA.grid } },
      y: { ticks: { color: SA.muted }, grid: { color: SA.grid } }
    }
  };

  // 1. Gráfico IoT en tiempo real (ESP32)
  const iotCanvas = document.getElementById('iotChart');
  if (!iotCanvas) return;
  const iotCtx = iotCanvas.getContext('2d');

  const iotChart = new Chart(iotCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temperatura (°C)',
          data: [],
          borderColor: SA.greenBright,
          backgroundColor: 'rgba(95, 211, 95, 0.15)',
          fill: true,
          borderWidth: 3,
          tension: 0.3
        },
        {
          label: 'Humedad (%)',
          data: [],
          borderColor: SA.orange,
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          borderWidth: 2,
          tension: 0.3
        }
      ]
    },
    options: baseOptions
  });

  // 2. Gráfico de ventas e inventario (Big Data)
  const salesCanvas = document.getElementById('salesChart');
  if (salesCanvas) {
    const salesCtx = salesCanvas.getContext('2d');
    new Chart(salesCtx, {
      type: 'bar',
      data: {
        labels: ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'],
        datasets: [
          {
            label: 'Ventas Reales ($)',
            data: [850000, 920000, 780000, 1100000, 1400000, 1800000, 1250000],
            backgroundColor: SA.green,
            borderColor: '#000',
            borderWidth: 2
          },
          {
            label: 'Predicción de Demanda ($)',
            data: [800000, 900000, 800000, 1050000, 1350000, 1750000, 1300000],
            backgroundColor: SA.orange,
            borderColor: '#000',
            borderWidth: 2
          }
        ]
      },
      options: baseOptions
    });
  }

  // Reloj del HUD
  const reloj = document.getElementById('hud-clock');
  const tick = () => { if (reloj) reloj.textContent = new Date().toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', hour12:false}); };
  tick(); setInterval(tick, 20000);

  // 3. Radio: mensajes rotativos
  const radio = document.getElementById('radio-track');
  const frases = [
    'Ahora suena: la cadena de frío no se rompe en esta bodega.',
    'Tráfico: el sábado es el día más fuerte, prepara inventario.',
    'Noticias: la predicción de demanda va a la par con las ventas reales.',
    'Aviso: si la humedad sube, revisa la bodega antes de que se dañe el producto.'
  ];
  let fraseActual = 0;
  if (radio) {
    radio.textContent = frases[0];
    setInterval(() => {
      fraseActual = (fraseActual + 1) % frases.length;
      radio.textContent = frases[fraseActual];
    }, 6000);
  }

  // 4. Actualizar datos en tiempo real desde la ESP32
  function actualizarDatosIoT(temp, hum) {
    const ahora = new Date().toLocaleTimeString();

    const tempElem = document.getElementById('temp-val');
    const humElem = document.getElementById('hum-val');
    const tempBar = document.getElementById('temp-bar');
    const humBar = document.getElementById('hum-bar');

    if (tempElem) tempElem.textContent = `${temp.toFixed(1)} °C`;
    if (humElem) humElem.textContent = `${hum.toFixed(1)} %`;

    // Barras tipo HUD: temperatura (0-40 °C) como salud, humedad (0-100 %) como chaleco
    if (tempBar) tempBar.style.width = `${Math.min(100, Math.max(0, (temp / 40) * 100))}%`;
    if (humBar) humBar.style.width = `${Math.min(100, Math.max(0, hum))}%`;

    iotChart.data.labels.push(ahora);
    iotChart.data.datasets[0].data.push(temp);
    iotChart.data.datasets[1].data.push(hum);

    if (iotChart.data.labels.length > 10) {
      iotChart.data.labels.shift();
      iotChart.data.datasets[0].data.shift();
      iotChart.data.datasets[1].data.shift();
    }

    iotChart.update();
  }

  // Primer dato inmediato y luego simulación de llegada de datos en vivo
  const lecturaSimulada = () => actualizarDatosIoT(16 + Math.random() * 4, 60 + Math.random() * 10);
  lecturaSimulada();
  setInterval(lecturaSimulada, 3000);
});
  // ---- Conexión real con la ESP32 ----
  const ESP32_URL = 'http://192.168.1.50/datos';   // <-- cambia por la IP de tu ESP32

  function setEstado(enLinea) {
    const badge = document.querySelector('.status-badge');
    if (!badge) return;
    badge.classList.toggle('offline', !enLinea);
    badge.innerHTML = '<span class="dot"></span> ' +
      (enLinea ? 'Respeto: ESP32 en línea' : 'Wasted: ESP32 sin conexión');
  }

  async function leerESP32() {
    try {
      const r = await fetch(ESP32_URL, { cache: 'no-store' });
      const d = await r.json();               // espera {"temp": 18.2, "hum": 64.5}
      actualizarDatosIoT(d.temp, d.hum);
      setEstado(true);
    } catch (e) {
      setEstado(false);
    }
  }

  leerESP32();
  setInterval(leerESP32, 3000);