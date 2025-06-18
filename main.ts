/**
 * stoppingGame.ts  –  Bun-ready, multi-threaded Monte-Carlo proof
 *
 *   bun run stoppingGame.ts [sims] [threads]
 *
 * sims    – total simulations (default 1 000 000)
 * threads – number of worker threads (default = logical CPU count)
 *
 * Theory recap:
 *   With ≤10 presses of U(0,TOP_PRIZE) the optimal strategy is a
 *   *threshold rule*.  When k presses remain, stop if draw ≥ T(k-1),
 *   where T(k-1) = f(k-1)·TOP_PRIZE and
 *        f(0)=0, f(1)=½, f(j)=½+½·f(j-1)²  for j≥2.
 *
 * The script:
 *   • Computes those thresholds once.
 *   • Splits the requested simulations evenly across N workers.
 *   • Each worker returns its subtotal; the main thread aggregates
 *     and prints the empirical mean.
 *
 * Requires Bun ≥ 1.0 (worker_threads API is built-in).
 */

import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import os from "os";

const MAX_PRESSES = 10;
const TOP_PRIZE = 100_000;

// ---------- Common helpers ----------

function computeF(maxPresses: number): number[] {
  const f: number[] = [0, 0.5]; // f(0), f(1)
  for (let j = 2; j <= maxPresses; j++) f.push(0.5 + 0.5 * f[j - 1] ** 2);
  return f;
}

function thresholds(maxPresses = MAX_PRESSES, prize = TOP_PRIZE): number[] {
  const f = computeF(maxPresses);
  const t: number[] = [];
  for (let k = maxPresses; k >= 1; k--) t.push(f[k - 1] * prize);
  return t;
}

function simulate(
  sims: number,
  th: number[],
  maxPresses = MAX_PRESSES,
  prize = TOP_PRIZE
): number {
  let winnings = 0;
  for (let s = 0; s < sims; s++) {
    for (let press = 1; press <= maxPresses; press++) {
      const idx = press - 1; // thresholds[] is reversed
      const draw = Math.random() * prize;
      const stop = draw >= th[idx] || press === maxPresses;
      if (stop) {
        winnings += draw;
        break;
      }
    }
  }
  return winnings;
}

// ---------- Worker code ----------

if (!isMainThread) {
  const { sims, maxPresses, prize } = workerData as {
    sims: number;
    maxPresses: number;
    prize: number;
  };
  const subtotal = simulate(
    sims,
    thresholds(maxPresses, prize),
    maxPresses,
    prize
  );
  parentPort!.postMessage(subtotal);
  // Worker exits automatically
}

// ---------- Main thread ----------

if (isMainThread) {
  const totalSims = Number.parseInt(process.argv[2] || "10000000000", 10);
  const numWorkers = Number.parseInt(
    process.argv[3] || `${os.cpus().length}`,
    10
  );

  const simsPerWorker = Math.floor(totalSims / numWorkers);
  const extra = totalSims % numWorkers;

  const th = thresholds(); // for final report
  const start = Date.now();

  let finished = 0;
  let grandTotal = 0;

  for (let i = 0; i < numWorkers; i++) {
    const sims = simsPerWorker + (i === 0 ? extra : 0); // add remainder to first
    new Worker(new URL(import.meta.url), {
      workerData: { sims, maxPresses: MAX_PRESSES, prize: TOP_PRIZE },
    }).on("message", (sub: number) => {
      grandTotal += sub;
      if (++finished === numWorkers) {
        // -------- Results --------
        console.log("\nOptimal thresholds (stop if current ≥ threshold):");
        th.forEach((t, i) => {
          const remaining = MAX_PRESSES - i;
          console.log(
            ` ${remaining.toString().padStart(2)} left → $${t.toFixed(2)}`
          );
        });
        const mean = grandTotal / totalSims;
        const secs = ((Date.now() - start) / 1000).toFixed(2);
        console.log(
          `\nSimulations: ${totalSims.toLocaleString()}  on ${numWorkers} threads`
        );
        console.log(`Average payout: $${mean.toFixed(2)}`);
        console.log(`Elapsed: ${secs}s`);
      }
    });
  }
}
