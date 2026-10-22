// Offline review of the single executed P07. No transport, credential loading or execution switch.
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, open, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
const project=resolve(dirname(fileURLToPath(import.meta.url)),"..");
let target,cache;
try {
  const mode=process.argv[2];
  if(process.argv.length!==3 || !["--inspect","--seal"].includes(mode))throw new Error("INVALID_ARGUMENTS");
  const root=await realpath(project);
  await mkdir(join(root,".cache/qloo-probe"),{recursive:true});cache=await realpath(join(root,".cache/qloo-probe"));
  const within=relative(root,cache);if(!within||within.startsWith("..")||isAbsolute(within))throw new Error("UNSAFE_TEMP_DIRECTORY");
  target=await mkdtemp(join(cache,"p07-review-"));await writeFile(join(target,"package.json"),'{"type":"commonjs"}\n');
  for(const dir of ["qloo","domain"]) {
    const output=join(target,"src",dir);await mkdir(output,{recursive:true});
    for(const name of await readdir(join(root,"src",dir)))if(name.endsWith(".ts"))
      await writeFile(join(output,name.replace(/\.ts$/,".js")),ts.transpileModule(await readFile(join(root,"src",dir,name),"utf8"),
        {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  }
  const require=createRequire(import.meta.url), module=(name)=>require(join(target,"src/qloo",name+".js"));
  const {inspectP07Capture}=module("p07-intake"),{inspectPrivateProbeLedger}=module("raw-probe-store");
  const {readPrivateSmall,decodeJson}=module("p07-consent"),{sealReviewedCapture,captureSha256}=module("capture-review");
  const {reviewObservedP07Body,loadP07Recordings,P07_REPLAY_FILE,P07_REPLAY_REVISION}=module("p07-recording");
  const intake=await inspectP07Capture(root);if(intake.status!=="CAPTURED_TRANSPORT_VALIDATED")throw new Error("P07_CAPTURE_NOT_AVAILABLE");
  const ledger=await inspectPrivateProbeLedger(root,"P07"),id=ledger.last_attempt_id;
  if(!id||ledger.reserved_attempts!==1||ledger.recorded_dispatches!==1||ledger.unresolved_attempts)throw new Error("P07_LEDGER_MISMATCH");
  const raw=await readPrivateSmall(root,["private","qloo-probes","p07","attempts",id,"response.raw.json"],262144);
  if(!raw)throw new Error("P07_RAW_MISSING");
  const observed=reviewObservedP07Body(decodeJson(raw));
  if(mode==="--inspect")process.stdout.write(JSON.stringify({status:"OBSERVED_SCHEMA_REVIEWED_NOT_ADMITTED",...observed,intake},null,2)+"\n");
  else {
    const reviewed=new Date().toISOString();
    await sealReviewedCapture(root,id,{body_sha256:captureSha256(raw),structural_review:"REVIEWED",projection_revision:P07_REPLAY_REVISION,reviewed_utc:reviewed});
    const file=join(root,"private/qloo-probes/p07/attempts",id,P07_REPLAY_FILE),handle=await open(file,"wx",0o600);
    try{await handle.writeFile(JSON.stringify({revision:P07_REPLAY_REVISION,body_sha256:captureSha256(raw),reviewed_utc:reviewed,locality_boundary_verified:false},null,2)+"\n");await handle.sync();}finally{await handle.close();}
    const set=await loadP07Recordings(root);
    process.stdout.write(JSON.stringify({status:"P07_SEALED_AND_REPLAY_ADMITTED",...observed,loader_accepts:true,candidates:set.discovery.found.length,
      independent_identity:"SEPARATE_REFERENCE_REQUIRED",real_repair:"NOT_ESTABLISHED_BY_SEAL"},null,2)+"\n");
  }
}catch{process.stderr.write('{"status":"BLOCKED","reason":"P07_REVIEW_REQUIRED"}\n');process.exitCode=2;}
finally{if(target&&cache){const rel=relative(cache,target);if(rel&&!rel.startsWith("..")&&!isAbsolute(rel))await rm(target,{recursive:true,force:true});}}
