const { setTimeout: wait } = require('node:timers/promises');

function parseArgs(argv) {
  const options = {
    apiUrl: process.env.HEALTH_API_URL || 'http://localhost:3000/health',
    webUrl: process.env.HEALTH_WEB_URL || 'http://localhost:5173',
    timeoutMs: Number(process.env.HEALTH_TIMEOUT_MS || 5000),
    retries: Number(process.env.HEALTH_RETRIES || 2),
    retryDelayMs: Number(process.env.HEALTH_RETRY_DELAY_MS || 1200),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === '--api' && next) {
      options.apiUrl = next;
      index += 1;
      continue;
    }
    if (current === '--web' && next) {
      options.webUrl = next;
      index += 1;
      continue;
    }
    if (current === '--timeout' && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (current === '--retries' && next) {
      options.retries = Number(next);
      index += 1;
      continue;
    }
    if (current === '--retry-delay' && next) {
      options.retryDelayMs = Number(next);
      index += 1;
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    options.timeoutMs = 5000;
  }
  if (!Number.isFinite(options.retries) || options.retries < 0) {
    options.retries = 2;
  }
  if (!Number.isFinite(options.retryDelayMs) || options.retryDelayMs < 0) {
    options.retryDelayMs = 1200;
  }

  return options;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
      },
    });

    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: body.slice(0, 300),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probe(name, url, options) {
  let lastResult = null;
  const attempts = options.retries + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await fetchWithTimeout(url, options.timeoutMs);
    lastResult = result;
    if (result.ok) {
      return {
        name,
        url,
        attempt,
        ok: true,
        status: result.status,
        detail: result.body,
      };
    }
    if (attempt < attempts) {
      await wait(options.retryDelayMs);
    }
  }

  return {
    name,
    url,
    attempt: attempts,
    ok: false,
    status: lastResult?.status ?? 0,
    detail: lastResult?.body || 'Sin respuesta',
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  console.log('Verificando salud de servicios...');
  console.log(`  API: ${options.apiUrl}`);
  console.log(`  WEB: ${options.webUrl}`);

  const [apiResult, webResult] = await Promise.all([
    probe('API', options.apiUrl, options),
    probe('WEB', options.webUrl, options),
  ]);

  const results = [apiResult, webResult];
  for (const result of results) {
    if (result.ok) {
      console.log(
        `[OK] ${result.name} responde (${result.status}) en intento ${result.attempt}`,
      );
    } else {
      console.error(
        `[FAIL] ${result.name} no responde correctamente tras ${result.attempt} intentos`,
      );
      console.error(`  URL: ${result.url}`);
      console.error(`  detalle: ${result.detail}`);
    }
  }

  if (results.every((item) => item.ok)) {
    console.log('Estado general: HEALTHY');
    return;
  }

  console.error('Estado general: UNHEALTHY');
  process.exitCode = 1;
}

run().catch((error) => {
  console.error('Error ejecutando chequeo de salud:', error);
  process.exitCode = 1;
});

