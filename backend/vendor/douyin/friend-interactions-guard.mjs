import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function readFriendInteractionsEnabled(stateDir) {
  if(fs.existsSync(path.join(stateDir,'friend-interactions-settings.guard')))return false;
  let value;
  try { value=JSON.parse(fs.readFileSync(path.join(stateDir,'friend-interactions-policy.json'),'utf8')); }
  catch(error) {if(error.code==='ENOENT')return true;throw new Error('好友互动总开关记录损坏，已停止好友互动。');}
  if(!value || value.version!==1 || typeof value.enabled!=='boolean'||Object.keys(value).some(key=>!['version','enabled'].includes(key)))throw new Error('好友互动总开关记录损坏，已停止好友互动。');
  return value.enabled;
}

export function acquireFriendInteractionDispatch(stateDir) {
  fs.mkdirSync(stateDir,{recursive:true});const file=path.join(stateDir,'friend-interactions-control.guard'),owner={pid:process.pid,token:randomUUID()};let descriptor;
  try{descriptor=fs.openSync(file,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Object.assign(new Error('好友互动总开关或发送正在更新，请稍后重试。'),{status:409,code:'FRIEND_INTERACTIONS_BUSY',beforeDelivery:true});throw error;}
  try{fs.writeFileSync(descriptor,JSON.stringify(owner));fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
  let released=false;return()=>{if(released)return;const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.pid===owner.pid&&current.token===owner.token){fs.unlinkSync(file);released=true;}};
}
