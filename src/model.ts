export type Unit = 'lb' | 'kg';
export type TrackingMode = 'reps' | 'time';
export type Role = 'client' | 'trainer' | 'owner';
export interface Profile { id: string; name: string; email: string; unit: Unit }
export interface TrainingGroup { id: string; name: string; owner_id: string; trainer_id: string | null; trainer_name?: string }
export interface Context { profile: Profile; group: TrainingGroup | null; is_owner: boolean; is_trainer: boolean; is_client: boolean; clients: Profile[] }
export interface SetRow { id: string; weight: number | null; reps: number | null; duration_seconds: number | null; completed: boolean }
export interface Exercise { id: string; name: string; unit: Unit; tracking: TrackingMode; sets: SetRow[] }
export interface Workout { id: string; client_id: string; date: string; title: string; exercises: Exercise[]; revision: number; updated_at: string; updated_by: string; editor_name?: string }
export interface Transfer { id: string; email: string; accepted_by: string | null; accepted_name?: string; expires_at: string }
export interface ExerciseScore { value: number; unit: 'kg' | 'reps' | 'sec' | 'kg·sec' }
export const uid = () => crypto.randomUUID();
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const blankSet = (): SetRow => ({ id: uid(), weight: null, reps: null, duration_seconds: null, completed: false });
export const newWorkout = (client_id: string): Workout => ({ id: uid(), client_id, date: today(), title: 'Training session', exercises: [], revision: 0, updated_at: new Date().toISOString(), updated_by: '' });
export const repeatWorkout = (w: Workout): Workout => ({ ...newWorkout(w.client_id), title: w.title, exercises: w.exercises.map(e => ({ ...e, id: uid(), sets: e.sets.map(s => ({ ...s, id: uid(), completed: false })) })) });
export const completedSets = (w: Workout) => w.exercises.reduce((n,e) => n+e.sets.filter(s=>s.completed).length,0);
export const totalSets = (w: Workout) => w.exercises.reduce((n,e)=>n+e.sets.length,0);
export const trackingForExercise = (name: string): TrackingMode => /(^|\s)(plank|hold|wall sit)(\s|$)/i.test(name) ? 'time' : 'reps';
export const weightInKg = (weight: number, unit: Unit) => unit === 'kg' ? weight : weight * 0.45359237;
export function exerciseScore(exercise: Exercise): ExerciseScore {
  const sets=exercise.sets.filter(s=>s.completed);
  const usesWeight=sets.some(s=>s.weight!==null);
  if(exercise.tracking==='time') return usesWeight
    ? {value:sets.reduce((total,s)=>total+(s.weight===null||s.duration_seconds===null?0:weightInKg(s.weight,exercise.unit)*s.duration_seconds),0),unit:'kg·sec'}
    : {value:sets.reduce((total,s)=>total+(s.duration_seconds??0),0),unit:'sec'};
  return usesWeight
    ? {value:sets.reduce((total,s)=>total+(s.weight===null||s.reps===null?0:weightInKg(s.weight,exercise.unit)*s.reps),0),unit:'kg'}
    : {value:sets.reduce((total,s)=>total+(s.reps??0),0),unit:'reps'};
}
export const formatScore = (score: ExerciseScore) => `${Number.isInteger(score.value)?score.value:score.value.toFixed(1)} ${score.unit}`;
export function scoreChange(current: ExerciseScore, previous?: ExerciseScore): number | null {
  if(!previous||previous.unit!==current.unit||previous.value<=0)return null;
  return (current.value-previous.value)/previous.value*100;
}
export const formatSet = (exercise: Exercise, set: SetRow) => {
  const effort = exercise.tracking === 'time' ? `${set.duration_seconds} sec` : `${set.reps} reps`;
  return set.weight === null ? effort : `${set.weight} ${exercise.unit} · ${effort}`;
};
export function normalizeWorkout(w: Workout): Workout {
  return {...w,exercises:(w.exercises??[]).map(e=>({...e,tracking:e.tracking??(e.sets?.some(s=>s.duration_seconds!=null)?'time':'reps'),sets:(e.sets??[]).map(s=>({...s,duration_seconds:s.duration_seconds??null}))}))};
}
export function validateWorkout(w: Workout): string | null {
  if (!w.title.trim() || w.title.length > 100) return 'Give this workout a title (up to 100 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date) || Number.isNaN(Date.parse(w.date)) || new Date(w.date).toISOString().slice(0,10)!==w.date) return 'Choose a valid workout date.';
  if (w.exercises.length > 50) return 'A workout can contain up to 50 exercises.';
  for (const e of w.exercises) {
    if (!e.name.trim() || e.name.length > 100) return 'Each exercise needs a name (up to 100 characters).';
    if (!['lb','kg'].includes(e.unit)) return 'Choose pounds or kilograms.';
    if (!['reps','time'].includes(e.tracking)) return 'Choose reps or time for each exercise.';
    if (e.sets.length > 100) return 'An exercise can contain up to 100 sets.';
    for (const s of e.sets) {
      if (s.weight !== null && (!Number.isFinite(s.weight) || s.weight<0 || s.weight>10000)) return 'Weight must be between 0 and 10,000, or left blank.';
      if (s.reps !== null && (!Number.isInteger(s.reps) || s.reps<1 || s.reps>10000)) return 'Reps must be a positive whole number.';
      if (s.duration_seconds !== null && (!Number.isInteger(s.duration_seconds) || s.duration_seconds<1 || s.duration_seconds>86400)) return 'Time must be between 1 and 86,400 seconds.';
      if (s.completed && e.tracking==='reps' && s.reps===null) return 'Enter reps before completing this set. Weight is optional.';
      if (s.completed && e.tracking==='time' && s.duration_seconds===null) return 'Enter time before completing this set. Weight is optional.';
    }
  }
  return null;
}
export function csv(workouts: Workout[], clients: Profile[]) {
  const escape = (value: unknown) => { let s=String(value??''); if (/^[\s]*[=+@-]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; };
  const rows: unknown[][]=[['Client','Date','Workout','Exercise','Set','Tracking','Weight','Unit','Weight (kg)','Reps','Seconds','Completed','Exercise score','Score unit']];
  workouts.forEach(w=>w.exercises.forEach(e=>{const score=exerciseScore(e);e.sets.forEach((s,i)=>rows.push([clients.find(c=>c.id===w.client_id)?.name??w.client_id,w.date,w.title,e.name,i+1,e.tracking,s.weight,e.unit,s.weight===null?null:weightInKg(s.weight,e.unit),e.tracking==='reps'?s.reps:null,e.tracking==='time'?s.duration_seconds:null,s.completed?'Yes':'No',score.value,score.unit]));}));
  return '\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n');
}
export const EXERCISES=['Back squat','Bench press','Deadlift','Dumbbell row','Lat pulldown','Leg press','Overhead press','Romanian deadlift','Seated cable row','Bicep curl','Tricep pushdown','Lateral raise','Push-up','Plank','Wall sit','Split squat','Calf raise'];
