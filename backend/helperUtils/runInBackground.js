/*
 * Run a promise as fire-and-forget without risking the process.
 *
 * `void somePromise()` looks harmless but is not: server.js handles
 * unhandledRejection by calling process.exit(1), so a single background
 * rejection takes the whole worker down. updateShiftStatus throws whenever the
 * job or shift cannot be matched - a deleted job, a stale shift id - which is
 * reachable from ordinary requests.
 *
 * Use this anywhere the result is not awaited: the work still runs, a failure
 * is logged with enough context to find it, and the request is unaffected.
 */
const runInBackground = (promise, context) => {
  Promise.resolve(promise).catch((err) => {
    console.error(
      `❌ Background task failed (${context}):`,
      err?.message || err,
    );
  });
};

module.exports = { runInBackground };
