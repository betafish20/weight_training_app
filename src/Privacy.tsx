import { Dumbbell } from 'lucide-react';

export default function Privacy() {
  return <main className="legal-page">
    <a className="legal-brand" href="/"><Dumbbell size={22}/> setbook<span>.</span></a>
    <article>
      <p className="eyebrow">PRIVACY</p>
      <h1>Privacy policy.</h1>
      <p className="legal-updated">Effective September 7, 2026</p>

      <h2>What Setbook stores</h2>
      <p>Setbook stores the name, email address, and profile picture supplied by Google Sign-In. It also stores the training groups, exercises, weights, repetitions, timed sets, and workout history that you create.</p>

      <h2>How the information is used</h2>
      <p>Your information is used to sign you in, keep your workout log, calculate exercise scores, and let members of your training group collaborate. It is not sold or used for advertising.</p>

      <h2>Who can see a workout</h2>
      <p>A client can see their own workouts. The assigned trainer and group owner can see and edit workouts for clients in that training group. Other clients cannot see your records.</p>

      <h2>Service providers</h2>
      <p>Google provides sign-in, Supabase provides authentication and database storage, and Cloudflare hosts the website. These providers process information according to their own privacy terms.</p>

      <h2>Keeping and deleting information</h2>
      <p>Workout information is kept while the account is active. To request a copy or deletion of your account and workout data, email <a href="mailto:suresh.antony@gmail.com">suresh.antony@gmail.com</a>.</p>

      <h2>Changes</h2>
      <p>This page will be updated when Setbook’s data practices change.</p>
      <a className="button primary legal-home" href="/">Return to Setbook</a>
    </article>
  </main>;
}
