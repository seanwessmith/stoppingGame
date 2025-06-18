Optimal-Stopping Simulator (Bun + TypeScript)

Monte-Carlo proof of the 10-press optimal-stopping game:

You may press a button up to 10 times.
Each press returns a value drawn uniformly from $0 – $100 000.
After seeing a value you can
	1.	Stop and take that amount, or
	2.	Continue (burning the current draw).

You must accept the 10th draw if you get that far.

The mathematically optimal strategy is a threshold rule: with k presses left, stop if the current draw ≥ Tk − 1, where

f(0)=0,\; f(1)=\tfrac12,\; f(j)=\tfrac12\bigl(1+f(j-1)^2\bigr)
\quad\Longrightarrow\quad
T_{k-1}=f(k-1)\times100\,000

This repo contains a multithreaded Bun script that
	•	computes those thresholds,
	•	distributes N Monte-Carlo simulations across all CPU cores (or a user-chosen count),
	•	aggregates results and prints the empirical mean payout.

⸻

✨ Quick start

# Clone & move into the project
git clone https://github.com/your-handle/optimal-stopping-bun.git
cd optimal-stopping-bun

# Install deps (only Bun itself is required)
bun install           # or just `bun` if no package.json lock exists

# One million sims on every logical core
bun run stoppingGame.ts

# 20 000 000 sims on exactly 8 threads
bun run stoppingGame.ts 20000000 8

Example output:

Optimal thresholds (stop if current ≥ threshold):
 10 left → $84 982.14
  9 left → $83 644.65
  8 left → $82 030.06
  7 left → $80 037.57
  6 left → $77 508.15
  5 left → $74 172.97
  4 left → $69 531.25
  3 left → $62 500.00
  2 left → $50 000.00
  1 left → $0.00

Simulations: 20,000,000  on 8 threads
Average payout: $86 108.88
Elapsed: 3.9 s

The theoretical optimum is $86 109 .8; the simulation converges rapidly.

⸻

🛠️ Arguments

Pos	Name	Default	Meaning
1	sims	1 000 000	Total simulations to run
2	threads	logical-CPU count	Worker threads to spawn

Any remainder sims (sims % threads) are added to the first worker for perfect coverage.

⸻

🧩 How it works
	1.	Threshold computation (pure math)
Builds the f(j) sequence once, then rescales by the prize ceiling.
	2.	Parallel engine
Uses Bun’s worker_threads API (Node-compatible) to fork identical workers.
Each worker:

subtotal = simulate(simCount, thresholds);
parentPort.postMessage(subtotal);
	3.	Aggregation
The main thread collects subtotals, sums them, prints thresholds, mean payout, and elapsed time.

⸻

📈 Performance tips
	•	CPU-bound → near-linear speed-up until you saturate physical cores.
	•	The script allocates zero shared memory; workers are embarrassingly parallel.
	•	For > 100 million sims, you’re still < 1 minute on a modern laptop.

⸻

📚 Folder layout

.
└─ stoppingGame.ts   # Main (and only) source file

No build step required—Bun transpiles TS on the fly.

⸻

📝 License

MIT.

⸻

🙏 Credits

Based on classic optimal-stopping analysis by Ferguson (1968) and many subsequent expositions.
