// One local run of existing checks. No deployment, Qloo dispatch, grant or private-data promotion.
// Keeps all logs and clean-install output in fresh directories; no recursive cleanup or prior-output overwrite.
import { spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveSensitiveTokens, loadPrivateFacts } from "./lib/private-tokens.mjs";
import { forbiddenPathLabels, scanTree, scanTraces } from "./lib/deploy-scan.mjs";

if(process.argv.length!==2)throw new Error("RELEASE_VERIFY_ACCEPTS_NO_ARGUMENTS");
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),sha=(b)=>createHash("sha256").update(b).digest("hex");
const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",maxBuffer:16*1024*1024}).trim();
const runId=new Date().toISOString().replace(/[:.]/g,"-")+"-"+randomUUID().slice(0,8);
const out=join(root,".artifacts/releases",runId);mkdirSync(out,{recursive:true});
const npm=join(dirname(process.execPath),"node_modules/npm/bin/npm-cli.js"),results=[];
const env={...process.env,NODE_OPTIONS:"--max-old-space-size=512",RAYON_NUM_THREADS:"2",NEXT_TELEMETRY_DISABLED:"1",
 TASTEGATE_DISABLE_LIVE:"1",TASTEGATE_VERIFICATION_OUTPUT_DIR:out,TASTEGATE_PUBLIC_SCREENSHOT_DIR:join(out,"screens"),
 PLAYWRIGHT_JSON_OUTPUT_NAME:join(out,"e2e.private.json"),TASTEGATE_NETGUARD_LOG:join(out,"network.jsonl")};
env.TASTEGATE_BROWSER_OUTPUT_DIR=join(out,"browser-results.private");
for(const key of Object.keys(env))if(/^(QLOO_API_KEY|LLM_API_KEY|EVAL_PUBLISH|EVAL_PUBLISH_RECORDED|TASTEGATE_ADMIN_ROOT)$/.test(key))delete env[key];
delete env.QLOO_MODE;
const source=git("ls-files","-co","--exclude-standard","-z").split("\0").filter(Boolean);
if(source.some(f=>forbiddenPathLabels(f).length))throw new Error("PRIVATE_SOURCE_PATH_REFUSED");
const manifest=source.filter(f=>existsSync(join(root,f))).map(path=>({path,sha256:sha(readFileSync(join(root,path)))}));
const revision={base_commit:git("rev-parse","HEAD"),working_tree_dirty:git("status","--porcelain")!=="",node:process.version};
const save=()=>{
 const summary={...revision,run_id:runId,results,overall:results.some(r=>r.status==="FAIL")?"FAIL":results.some(r=>r.status==="NOT_RUN")?"PARTIAL":"PASS"};
 writeFileSync(join(out,"results.json"),JSON.stringify(summary,null,2)+"\n");
 writeFileSync(join(root,".artifacts/release-latest.json"),JSON.stringify({directory:out,run_id:runId})+"\n");
};
const record=(name,status,detail={})=>{results.push({name,status,...detail});save();process.stdout.write(name+": "+status+"\n");};
function command(name,args,cwd=root,extra={}) {
 const began=Date.now();
 const r=spawnSync(process.execPath,[npm,...args],{cwd,windowsHide:true,encoding:"utf8",maxBuffer:24*1024*1024,timeout:600000,env:{...env,...extra}});
 writeFileSync(join(out,name+".log"),(r.stdout??"")+(r.stderr??""));
 record(name,r.status===0?"PASS":"FAIL",{command:"npm "+args.join(" "),exit_code:r.status,duration_seconds:(Date.now()-began)/1000,error:r.error?.code??null});
 return r.status===0;
}
writeFileSync(join(out,"source-manifest.json"),JSON.stringify({...revision,files:manifest},null,2)+"\n");
// Actual npm ci in a source-only checkout; installed dependencies are not copied or linked.
const tempBase=resolve(process.env.TASTEGATE_RELEASE_TEMP??tmpdir());mkdirSync(tempBase,{recursive:true});
const clean=mkdtempSync(join(tempBase,"tastegate-release-"));writeFileSync(join(out,"clean-checkout.private.json"),JSON.stringify({directory:clean})+"\n");
for(const f of manifest){const dest=join(clean,f.path);mkdirSync(dirname(dest),{recursive:true});copyFileSync(join(root,f.path),dest);}
command("typecheck",["run","typecheck"]);
command("unit",["test","--","--maxWorkers=2","--reporter=default","--reporter=json","--outputFile="+join(out,"unit.private.json")],root,{TASTEGATE_DISABLE_LIVE:""});
const built=command("build",["run","build"]);
if(built)command("e2e",["run","test:e2e"]);else record("e2e","NOT_RUN",{reason:"PRODUCTION_BUILD_FAILED"});
command("evaluation",["run","eval"]);
command("deploy-safety",["run","safety:deploy"]);
command("deploy-selftest",["run","safety:deploy:selftest"]);
const standalone=command("standalone",["run","build:standalone"]);
if(standalone)command("production-smoke",["run","smoke:prod"]);else record("production-smoke","NOT_RUN",{reason:"STANDALONE_BUILD_FAILED"});
const installed=command("clean-install",["ci","--ignore-scripts","--no-audit","--no-fund","--cache",join(root,".cache/npm")],clean);
if(installed) {
 command("dependency-consistency",["ls","--all","--json"],clean);
 const cleanBuilt=command("clean-standalone",["run","build:standalone"],clean);
 if(cleanBuilt)command("clean-production-smoke",["run","smoke:prod"],clean,{TASTEGATE_VERIFICATION_OUTPUT_DIR:join(out,"clean-production")});
 else record("clean-production-smoke","NOT_RUN",{reason:"CLEAN_BUILD_FAILED"});
}else record("clean-production-smoke","NOT_RUN",{reason:"CLEAN_INSTALL_FAILED"});
const docker=spawnSync("docker",["info","--format","{{.ServerVersion}}"],{windowsHide:true,encoding:"utf8",timeout:15000});
if(docker.status===0)command("container",["run","smoke:container"]);else record("container","NOT_RUN",{reason:"DOCKER_ENGINE_UNAVAILABLE"});
try {
 const sensitive=await deriveSensitiveTokens(root),facts=await loadPrivateFacts(root);
 if(!sensitive.available)record("actual-artifact-privacy","NOT_RUN",{reason:"OWNER_PRIVATE_TOKENS_UNAVAILABLE; CANARY_GATE_RECORDED_SEPARATELY"});
 else {
  const needles=[...[...sensitive.tokens].map(([token,label])=>[label,token]),...facts.map(t=>["private_fact",t])];
  const scans=[];
  for(const rel of [".next/server",".next/static",".next/standalone"]) {
   if(!existsSync(join(root,rel)))throw new Error("MISSING_BUILD_ARTIFACT");
   const scan=await scanTree(join(root,rel),{needles});scans.push({target:rel,files:scan.files,hits:scan.findings.length,skipped:scan.skipped.length});
  }
  const traces=await scanTraces(join(root,".next"),{skipDirs:["cache","standalone"]});
  const report={targets:scans,trace_findings:traces.findings.length};
  writeFileSync(join(out,"actual-artifact-privacy.json"),JSON.stringify(report,null,2)+"\n");
  record("actual-artifact-privacy",scans.every(s=>!s.hits&&!s.skipped)&&!traces.findings.length?"PASS":"FAIL",{targets:scans,trace_findings:traces.findings.length});
 }
}catch{record("actual-artifact-privacy","FAIL",{reason:"ARTIFACT_SCAN_FAILED"});}
const drift=manifest.filter(f=>!f.path.endsWith(".md")&&!f.path.endsWith(".txt")&&sha(readFileSync(join(root,f.path)))!==f.sha256).length;
record("source-integrity",drift?"FAIL":"PASS",{changed_build_input_files:drift});
const diff=spawnSync("git",["diff","--check"],{cwd:root,encoding:"utf8",windowsHide:true});
writeFileSync(join(out,"diff-check.log"),(diff.stdout??"")+(diff.stderr??""));record("diff-check",diff.status===0?"PASS":"FAIL",{exit_code:diff.status});
const totals={unit:null,e2e:null};
try { const u=JSON.parse(readFileSync(join(out,"unit.private.json"),"utf8"));totals.unit={passed:u.numPassedTests,failed:u.numFailedTests,skipped:u.numPendingTests,total:u.numTotalTests}; }catch{}
try { const e=JSON.parse(readFileSync(join(out,"e2e.private.json"),"utf8"));totals.e2e={passed:e.stats.expected,failed:e.stats.unexpected,skipped:e.stats.skipped,flaky:e.stats.flaky}; }catch{}
writeFileSync(join(out,"totals.public.json"),JSON.stringify(totals,null,2)+"\n");
save();process.stdout.write("Release evidence: "+out+"\n");
process.exitCode=results.some(r=>r.status==="FAIL")?1:0;
