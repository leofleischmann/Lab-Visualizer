/**
 * Debug-Ausgaben des Backends im Format "[Debug <script>]: …".
 *
 * Standardmaessig AUS, damit Tests und Produktionslogs ruhig bleiben. Mit
 * `DEBUG_LOG=true` (siehe .env.example / docker-compose.yml) erscheinen sie in
 * `docker compose logs backend` - gedacht vor allem, um nachzuvollziehen, was
 * ein MCP-Client oder ein API-Skript tatsaechlich schickt.
 *
 * Wird bei jedem Aufruf frisch gelesen, damit Tests es gezielt einschalten koennen.
 */
export function debugLog(script, ...args) {
  if (process.env.DEBUG_LOG !== 'true') return;
  console.debug(`[Debug ${script}]:`, ...args);
}
