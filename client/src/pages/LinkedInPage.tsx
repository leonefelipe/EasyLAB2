2026-04-16T02:42:15.668959948Z ==> Downloading cache...
2026-04-16T02:42:15.703117757Z ==> Cloning from https://github.com/leonefelipe/EasyLAB2
2026-04-16T02:42:16.251598315Z ==> Checking out commit 0d8f7c036e613ed9d239cdac91b148e79ea874a5 in branch main
2026-04-16T02:42:31.877295498Z ==> Downloaded 220MB in 3s. Extraction took 13s.
2026-04-16T02:42:35.9925696Z ==> Using Node.js version 22.22.0 (default)
2026-04-16T02:42:36.017723966Z ==> Docs on specifying a Node.js version: https://render.com/docs/node-version
2026-04-16T02:42:36.127878109Z ==> Running build command 'pnpm install --frozen-lockfile; pnpm run build'...
2026-04-16T02:42:37.793032902Z 
2026-04-16T02:42:37.793062293Z ╭ Warning ─────────────────────────────────────────────────────────────────────╮│                                                                              ││   Ignored build scripts: @tailwindcss/oxide, core-js, esbuild, puppeteer.    ││   Run "pnpm approve-builds" to pick which dependencies should be allowed     ││   to run scripts.                                                            ││                                                                              │╰──────────────────────────────────────────────────────────────────────────────╯
2026-04-16T02:42:37.793068473Z 
2026-04-16T02:42:37.831324998Z Done in 1.2s using pnpm v10.4.1
2026-04-16T02:42:38.479957304Z 
2026-04-16T02:42:38.479979915Z > easy-job-ai@1.0.0 build /opt/render/project/src
2026-04-16T02:42:38.479986025Z > vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
2026-04-16T02:42:38.479989495Z 
2026-04-16T02:42:38.829601709Z vite v7.1.9 building for production...
2026-04-16T02:42:38.877516717Z (!) %VITE_ANALYTICS_ENDPOINT% is not defined in env variables found in /index.html. Is the variable mistyped?
2026-04-16T02:42:38.877551108Z (!) %VITE_ANALYTICS_WEBSITE_ID% is not defined in env variables found in /index.html. Is the variable mistyped?
2026-04-16T02:42:38.892518964Z <script src="%VITE_ANALYTICS_ENDPOINT%/umami"> in "/index.html" can't be bundled without type="module" attribute
2026-04-16T02:42:38.919372231Z transforming...
2026-04-16T02:42:39.187141933Z Found 1 warning while optimizing generated CSS:
2026-04-16T02:42:39.187165614Z 
2026-04-16T02:42:39.187171094Z │   initial-value: 0;
2026-04-16T02:42:39.187175444Z │ }
2026-04-16T02:42:39.187182384Z │ @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
2026-04-16T02:42:39.187188145Z ┆        ^-- @import rules must precede all rules aside from @charset and @layer statements
2026-04-16T02:42:39.187192485Z ┆
2026-04-16T02:42:39.187197915Z │ :root {
2026-04-16T02:42:39.187202505Z │   --primary: #1e3a8a;
2026-04-16T02:42:39.187206315Z 
2026-04-16T02:42:39.471926993Z ✓ 74 modules transformed.
2026-04-16T02:42:39.472261683Z ✗ Build failed in 605ms
2026-04-16T02:42:39.472396057Z error during build:
2026-04-16T02:42:39.472403547Z client/src/pages/LinkedInPage (17:0): Expression expected (Note that you need plugins to import files that are not JavaScript)
2026-04-16T02:42:39.472417138Z file: /opt/render/project/src/client/src/pages/LinkedInPage:17:0
2026-04-16T02:42:39.472419688Z 
2026-04-16T02:42:39.472423278Z 15: // ─── Types ────────────────────────────────────────────────────────────────────
2026-04-16T02:42:39.472425908Z 16: 
2026-04-16T02:42:39.472428988Z 17: interface LinkedInAnalysis {
2026-04-16T02:42:39.472431559Z     ^
2026-04-16T02:42:39.472434159Z 18:   profileStrength: number;
2026-04-16T02:42:39.472439089Z 19:   ssiEstimate: number;
2026-04-16T02:42:39.472441549Z 
2026-04-16T02:42:39.472444549Z     at getRollupError (file:///opt/render/project/src/node_modules/.pnpm/rollup@4.52.4/node_modules/rollup/dist/es/shared/parseAst.js:401:41)
2026-04-16T02:42:39.472447769Z     at ParseError.initialise (file:///opt/render/project/src/node_modules/.pnpm/rollup@4.52.4/node_modules/rollup/dist/es/shared/node-entry.js:14454:28)
2026-04-16T02:42:39.472450289Z     at convertNode (file:///opt/render/project/src/node_modules/.pnpm/rollup@4.52.4/node_modules/rollup/dist/es/shared/node-entry.js:16337:10)
2026-04-16T02:42:39.472452809Z     at convertProgram (file:///opt/render/project/src/node_modules/.pnpm/rollup@4.52.4/node_modules/rollup/dist/es/shared/node-entry.js:15577:12)
2026-04-16T02:42:39.472455289Z     at Module.setSource (file:///opt/render/project/src/node_modules/.pnpm/rollup@4.52.4/node_modules/rollup/dist/es/shared/node-entry.js:17332:24)
2026-04-16T02:42:39.472458299Z     at async ModuleLoader.addModuleSource (file:///opt/render/project/src/node_modules/.pnpm/rollup@4.52.4/node_modules/rollup/dist/es/shared/node-entry.js:21352:13)
2026-04-16T02:42:39.499608526Z  ELIFECYCLE  Command failed with exit code 1.
2026-04-16T02:42:39.563214332Z ==> Build failed 😞
2026-04-16T02:42:39.563234233Z ==> Common ways to troubleshoot your deploy: https://render.com/docs/troubleshooting-deploys