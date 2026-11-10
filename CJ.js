window.addEventListener("load", () => {
  console.log("San Andreas Dashboard iniciado.");
    // ---- Ingresos y salidas (por día) ----
  const CLAVE = 'movimientosUbate2';
  const dinero = n => '$' + Math.abs(n).toLocaleString('es-CO');
  const signo = n => (n < 0 ? '-' : '') + dinero(n);
  const dosDig = n => String(n).padStart(2, '0');
  const hoyISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + dosDig(d.getMonth() + 1) + '-' + dosDig(d.getDate());
  };
  const fechaBonita = iso => iso.split('-').reverse().join('/');
  const suma = (lista, tipo) => lista.filter(m => m.tipo === tipo).reduce((a, m) => a + m.valor, 0);
  const fijar = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  let movimientos = [];
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE));
    if (Array.isArray(g)) movimientos = g;
  } catch (e) {}
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(movimientos)); } catch (e) {} };

  const diaInput = document.getElementById('dia-sel');
  if (diaInput) diaInput.value = hoyISO();
  const diaActual = () => (diaInput && diaInput.value) || hoyISO();
  const movsDelDia = dia => movimientos.filter(m => m.fecha === dia).sort((a, b) => a.hora.localeCompare(b.hora));

  function pintarMovimientos() {
    const dia = diaActual();
    const delDia = movsDelDia(dia);
    const body = document.getElementById('mov-body');
    if (body) {
      body.replaceChildren();
      if (!delDia.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5; td.className = 'vacio'; td.textContent = 'Sin movimientos este día';
        tr.appendChild(td); body.appendChild(tr);
      }
      delDia.forEach(m => {
        const tr = document.createElement('tr');
        const celdas = [m.hora, m.concepto, m.tipo === 'ingreso' ? 'Ingreso' : 'Salida',
          (m.tipo === 'ingreso' ? '+' : '-') + dinero(m.valor)];
        celdas.forEach((txt, i) => {
          const td = document.createElement('td');
          td.textContent = txt;
          if (i >= 2) td.className = m.tipo;
          if (i === 3) td.classList.add('num');
          tr.appendChild(td);
        });
        const tdDel = document.createElement('td');
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'del'; b.textContent = '×';
        b.setAttribute('aria-label', 'Eliminar movimiento');
        b.addEventListener('click', () => {
          movimientos = movimientos.filter(x => x.id !== m.id);
          guardar(); pintarMovimientos();
        });
        tdDel.appendChild(b); tr.appendChild(tdDel);
        body.appendChild(tr);
      });
    }

    // Totales del día seleccionado
    const ingDia = suma(delDia, 'ingreso'), salDia = suma(delDia, 'salida');
    fijar('tot-ing', '+' + dinero(ingDia));
    fijar('tot-sal', '-' + dinero(salDia));
    fijar('tot-saldo', signo(ingDia - salDia));

    // Total acumulado de TODOS los días (se suma solo cada vez que agregas un movimiento)
    const saldoTotal = suma(movimientos, 'ingreso') - suma(movimientos, 'salida');
    fijar('tot-acum', signo(saldoTotal));
    const hud = document.getElementById('hud-money');
    if (hud) {
      hud.textContent = signo(saldoTotal);
      hud.style.color = saldoTotal < 0 ? '#ff6b6b' : '';
    }

    // Tarjeta "Ventas del día": ingresos de HOY
    const hoy = movsDelDia(hoyISO());
    const ingHoy = suma(hoy, 'ingreso');
    fijar('ventas-dia', dinero(ingHoy));
    fijar('ventas-dia-sub', ingHoy ? 'Salidas de hoy: ' + dinero(suma(hoy, 'salida')) : 'Aún sin ventas hoy');
  }

  const formMov = document.getElementById('mov-form');
  if (formMov) {
    formMov.addEventListener('submit', e => {
      e.preventDefault();
      const concepto = formMov.elements.concepto.value.trim();
      const valor = Number(formMov.elements.valor.value);
      const err = document.getElementById('mov-error');
      if (!concepto || !(valor > 0)) {
        err.textContent = 'Escribe un concepto y un valor mayor a 0';
        return;
      }
      err.textContent = '';
      const d = new Date();
      movimientos.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        fecha: diaActual(),
        hora: dosDig(d.getHours()) + ':' + dosDig(d.getMinutes()),
        concepto, tipo: formMov.elements.tipo.value, valor
      });
      guardar(); formMov.reset(); pintarMovimientos();
    });
  }
  if (diaInput) diaInput.addEventListener('change', () => { fijar('mov-error', ''); pintarMovimientos(); });

  // PDF del día seleccionado
  const btnPdf = document.getElementById('btn-pdf');
  if (btnPdf) btnPdf.addEventListener('click', () => {
    const err = document.getElementById('mov-error');
    const dia = diaActual();
    const lista = movsDelDia(dia);
    if (!lista.length) { err.textContent = 'No hay movimientos en ese día para guardar'; return; }
    if (!window.jspdf) { err.textContent = 'No cargó la librería de PDF, revisa tu conexión a internet'; return; }
    err.textContent = '';
    const doc = new window.jspdf.jsPDF();
    doc.setFillColor(0, 0, 0); doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text('Ubaté Stories', 14, 14);
    doc.setFontSize(11); doc.setTextColor(240, 168, 58); doc.text('Reporte del día ' + fechaBonita(dia), 14, 23);
    let y = 42;
    const cabecera = () => {
      doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text('Hora', 14, y); doc.text('Concepto', 36, y); doc.text('Tipo', 130, y);
      doc.text('Valor', 196, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 3; doc.line(14, y, 196, y); y += 7;
    };
    cabecera();
    lista.forEach(m => {
      if (y > 275) { doc.addPage(); y = 20; cabecera(); }
      doc.setTextColor(0, 0, 0);
      doc.text(m.hora, 14, y);
      doc.text(doc.splitTextToSize(m.concepto, 90)[0], 36, y);
      doc.text(m.tipo === 'ingreso' ? 'Ingreso' : 'Salida', 130, y);
      if (m.tipo === 'ingreso') doc.setTextColor(30, 130, 50); else doc.setTextColor(190, 40, 40);
      doc.text((m.tipo === 'ingreso' ? '+' : '-') + dinero(m.valor), 196, y, { align: 'right' });
      y += 7;
    });
    if (y > 240) { doc.addPage(); y = 20; }
    y += 3; doc.line(14, y, 196, y); y += 8;
    const ing = suma(lista, 'ingreso'), sal = suma(lista, 'salida');
    const hasta = movimientos.filter(m => m.fecha <= dia);
    const acumulado = suma(hasta, 'ingreso') - suma(hasta, 'salida');
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold');
    doc.text('Total ingresos', 14, y); doc.text('+' + dinero(ing), 196, y, { align: 'right' }); y += 7;
    doc.text('Total salidas', 14, y); doc.text('-' + dinero(sal), 196, y, { align: 'right' }); y += 7;
    doc.text('Saldo del día', 14, y); doc.text(signo(ing - sal), 196, y, { align: 'right' }); y += 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Acumulado total hasta este día: ' + signo(acumulado), 14, y);
    doc.save('reporte-' + dia + '.pdf');
  });

  pintarMovimientos();

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
  //const lecturaSimulada = () => actualizarDatosIoT(16 + Math.random() * 4, 60 + Math.random() * 10);
  //lecturaSimulada();
  //setInterval(lecturaSimulada, 3000);

  // ---- Conexión real con la ESP32 ----
  const ESP32_URL = 'http://10.157.16.157/datos';   // <-- cambia por la IP de tu ESP32

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
});