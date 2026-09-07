import { createClient } from '@supabase/supabase-js';
import { normalizeWorkout, type Context, type Profile, type Role, type Transfer, type Workout, uid, today } from './model';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url,key) : null;
export const DEMO_KEY='setbook-demo-v1';
const me: Profile={id:'demo-client',name:'Suresh',email:'suresh@example.test',unit:'lb'};
const trainer: Profile={id:'demo-trainer',name:'Alex Morgan',email:'alex@example.test',unit:'lb'};
const maya: Profile={id:'demo-maya',name:'Maya Chen',email:'maya@example.test',unit:'kg'};
interface Demo { profiles: Profile[]; workouts: Workout[] }
function seed(): Demo {
  const dates=[3,7,10,14].map(n=>{ const d=new Date();d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  return {profiles:[me,trainer,maya],workouts: dates.map((date,i)=>({id:uid(),client_id:me.id,date,title:i%2?'Upper body':'Full body strength',revision:1,updated_at:new Date().toISOString(),updated_by:trainer.id,editor_name:trainer.name,exercises:[{id:uid(),name:'Back squat',unit:'lb',tracking:'reps',sets:[1,2,3].map(()=>({id:uid(),weight:95-i*5,reps:10,duration_seconds:null,completed:true}))},{id:uid(),name:'Dumbbell row',unit:'lb',tracking:'reps',sets:[1,2,3].map(()=>({id:uid(),weight:25,reps:12,duration_seconds:null,completed:true}))},{id:uid(),name:'Plank',unit:'lb',tracking:'time',sets:[1,2,3].map(()=>({id:uid(),weight:null,reps:null,duration_seconds:30,completed:true}))}]}))};
}
function demoRead(): Demo { try { const s=localStorage.getItem(DEMO_KEY); if(s) {const data=JSON.parse(s) as Demo;return {...data,workouts:data.workouts.map(normalizeWorkout)};} } catch { /* Fresh demo if storage is corrupt. */ } const data=seed();localStorage.setItem(DEMO_KEY,JSON.stringify(data));return data; }
export async function rpc<T>(name: string,args: Record<string,unknown>={}): Promise<T> { if(!supabase) throw new Error('Connect Supabase to use real accounts.'); const {data,error}=await supabase.rpc(name,args); if(error) throw new Error(error.message);return data as T; }
export async function getContext(demo: boolean, role: Role): Promise<Context> {
  if (!demo) return rpc<Context>('get_context');
  const d=demoRead();const profile=d.profiles.find(p=>p.id===(role==='trainer'?trainer.id:me.id))!;
  return {profile,group:{id:'demo-group',name:'The Training Room',owner_id:me.id,trainer_id:trainer.id,trainer_name:trainer.name},is_client:profile.id===me.id,is_owner:role==='owner',is_trainer:role==='trainer',clients:role==='trainer'?d.profiles.filter(p=>p.id!==trainer.id):[profile]};
}
export async function getWorkouts(demo: boolean, client: string): Promise<Workout[]> {
  if(demo) return demoRead().workouts.filter(w=>w.client_id===client).sort((a,b)=>b.date.localeCompare(a.date));
  return (await rpc<Workout[]>('list_workouts',{p_client:client})).map(normalizeWorkout);
}
export async function saveWorkout(demo: boolean,w: Workout,actor: Profile): Promise<Workout> {
  if(!demo) return normalizeWorkout(await rpc<Workout>('save_workout',{p_workout:w,p_expected_revision:w.revision}));
  const d=demoRead();const existing=d.workouts.find(x=>x.id===w.id);
  if(existing && existing.revision!==w.revision) throw new Error('CONFLICT: This workout changed in another session. Reload the saved version.');
  const saved={...w,revision:w.revision+1,updated_at:new Date().toISOString(),updated_by:actor.id,editor_name:actor.name};d.workouts=[saved,...d.workouts.filter(x=>x.id!==w.id)];localStorage.setItem(DEMO_KEY,JSON.stringify(d));return saved;
}
export async function updateProfile(demo: boolean,p: Profile) { if(demo) {const d=demoRead(); d.profiles=d.profiles.map(x=>x.id===p.id?p:x);localStorage.setItem(DEMO_KEY,JSON.stringify(d));} else await rpc('update_profile',{p_name:p.name,p_unit:p.unit}); }
export async function signIn() { if(!supabase) throw new Error('Supabase has not been configured.'); const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+'/auth/callback'}}); if(error) throw error; }
export async function getTransfers(): Promise<Transfer[]> { return rpc('list_transfers'); }
export const demoToday = today;
