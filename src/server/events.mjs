/* Server-sent events: debounced change broadcasts and client streams. */

export function createBroadcaster(clients, delay = 60) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const payload = `data: ${JSON.stringify({ type: "change", at: Date.now() })}\n\n`;
      for (const res of clients) {
        try { res.write(payload); } catch { clients.delete(res); }
      }
    }, delay);
  };
}

export function attachEventStream(req, res, clients) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);
  clients.add(res);
  const beat = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, 20000);
  req.on("close", () => { clearInterval(beat); clients.delete(res); });
}
