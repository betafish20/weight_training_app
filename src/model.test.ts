import { describe, expect, it } from 'vitest';
import { csv, exerciseScore, newWorkout, normalizeWorkout, repeatWorkout, scoreChange, validateWorkout, weightInKg, type Profile, type Workout } from './model';

const client: Profile={id:'client-1',name:'=Formula',email:'test@example.com',unit:'lb'};
function completeWorkout(): Workout {
  const w=newWorkout(client.id);
  w.title='Strength';
  w.exercises=[{id:crypto.randomUUID(),name:'Back squat',unit:'lb',tracking:'reps',sets:[{id:crypto.randomUUID(),weight:95,reps:10,duration_seconds:null,completed:true}]}];
  return w;
}
describe('workouts',()=>{
  it('accepts a complete workout',()=>expect(validateWorkout(completeWorkout())).toBeNull());
  it('requires reps before completing a rep-based set',()=>{const w=completeWorkout();w.exercises[0].sets[0].reps=null;expect(validateWorkout(w)).toMatch(/enter reps/i);});
  it('accepts a completed bodyweight set without a weight',()=>{const w=completeWorkout();w.exercises[0].name='Push-up';w.exercises[0].sets[0].weight=null;expect(validateWorkout(w)).toBeNull();});
  it('accepts a completed timed set without reps or weight',()=>{const w=completeWorkout();w.exercises[0]={id:crypto.randomUUID(),name:'Plank',unit:'lb',tracking:'time',sets:[{id:crypto.randomUUID(),weight:null,reps:null,duration_seconds:30,completed:true}]};expect(validateWorkout(w)).toBeNull();});
  it('requires seconds before completing a timed set',()=>{const w=completeWorkout();w.exercises[0]={id:crypto.randomUUID(),name:'Plank',unit:'lb',tracking:'time',sets:[{id:crypto.randomUUID(),weight:null,reps:null,duration_seconds:null,completed:true}]};expect(validateWorkout(w)).toMatch(/enter time/i);});
  it('copies previous values but resets completion',()=>{const copy=repeatWorkout(completeWorkout());expect(copy.revision).toBe(0);expect(copy.exercises[0].sets[0]).toMatchObject({weight:95,reps:10,duration_seconds:null,completed:false});});
  it('prevents spreadsheet formulas in CSV fields',()=>{const output=csv([completeWorkout()],[client]);expect(output).toContain("'=Formula");});
  it('normalizes pounds to kilograms for a weighted score',()=>{expect(weightInKg(100,'lb')).toBeCloseTo(45.359237);expect(exerciseScore(completeWorkout().exercises[0])).toEqual({value:95*0.45359237*10,unit:'kg'});});
  it('scores bodyweight work by reps and timed work by seconds',()=>{const w=completeWorkout();w.exercises[0].sets[0].weight=null;expect(exerciseScore(w.exercises[0])).toEqual({value:10,unit:'reps'});w.exercises[0]={id:crypto.randomUUID(),name:'Plank',unit:'lb',tracking:'time',sets:[{id:crypto.randomUUID(),weight:null,reps:null,duration_seconds:30,completed:true}]};expect(exerciseScore(w.exercises[0])).toEqual({value:30,unit:'sec'});});
  it('compares scores only when their units match',()=>{expect(scoreChange({value:125,unit:'reps'},{value:100,unit:'reps'})).toBe(25);expect(scoreChange({value:30,unit:'sec'},{value:10,unit:'reps'})).toBeNull();});
  it('exports optional weight, normalized kilograms, timed seconds, and score',()=>{const w=completeWorkout();w.exercises[0]={id:crypto.randomUUID(),name:'Plank',unit:'lb',tracking:'time',sets:[{id:crypto.randomUUID(),weight:null,reps:null,duration_seconds:30,completed:true}]};const output=csv([w],[client]);expect(output).toContain('"Weight (kg)"');expect(output).toContain('"Exercise score","Score unit"');expect(output).toContain('"time","","lb","","","30","Yes","30","sec"');});
  it('upgrades workouts saved before time tracking was added',()=>{const old=completeWorkout() as unknown as {exercises:Array<Record<string,unknown>>};delete old.exercises[0].tracking;const sets=old.exercises[0].sets as Array<Record<string,unknown>>;delete sets[0].duration_seconds;const upgraded=normalizeWorkout(old as unknown as Workout);expect(upgraded.exercises[0].tracking).toBe('reps');expect(upgraded.exercises[0].sets[0].duration_seconds).toBeNull();});
});
