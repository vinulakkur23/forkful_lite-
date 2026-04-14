/**
 * Backfill script — replay the iconic-eats unlock matcher across all existing
 * mealEntries so users get retroactive unlocks for past posts.
 *
 * Usage (from repo root):
 *   node scripts/backfillIconicUnlocks.js              # dry run, logs only
 *   node scripts/backfillIconicUnlocks.js --apply      # actually write
 *   node scripts/backfillIconicUnlocks.js --city la    # limit to one city
 *   node scripts/backfillIconicUnlocks.js --user UID   # limit to one user
 *
 * Safe to re-run: `applyIconicUnlock` in iconicEatsUnlock.js is idempotent
 * (checks for existing unlock subcollection doc).
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(
  __dirname,
  '..',
  'firebase-service-account.json',
));
admin.initializeApp({credential: admin.credential.cert(serviceAccount)});

const db = admin.firestore();

// Reuse the same matcher + apply logic the live trigger uses so behavior
// cannot drift between backfill and production.
const {
  findMatchingIconicEat,
  applyIconicUnlock,
} = require('../functions/iconicEatsUnlock');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {apply: false, city: null, user: null};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--city') out.city = (args[++i] || '').toLowerCase().trim();
    else if (a === '--user') out.user = args[++i];
  }
  return out;
}

function extractMealCity(meal) {
  const raw =
    (meal && meal.city) ||
    (meal && meal.location && meal.location.city) ||
    null;
  return raw ? String(raw).toLowerCase().trim() : null;
}

async function loadIconicEatsByCity() {
  const snap = await db.collection('best_eats').where('active', '==', true).get();
  const byCity = new Map();
  snap.forEach((doc) => {
    const data = doc.data();
    const cityKey = (data.city || '').toLowerCase().trim();
    if (!cityKey) return;
    if (!byCity.has(cityKey)) byCity.set(cityKey, []);
    byCity.get(cityKey).push({id: doc.id, data});
  });
  return byCity;
}

async function main() {
  const args = parseArgs();
  console.log('[backfill] mode:', args.apply ? 'APPLY' : 'DRY-RUN');
  if (args.city) console.log('[backfill] city filter:', args.city);
  if (args.user) console.log('[backfill] user filter:', args.user);

  const eatsByCity = await loadIconicEatsByCity();
  console.log(
    `[backfill] loaded ${[...eatsByCity.values()].reduce((n, a) => n + a.length, 0)} ` +
      `iconic eats across ${eatsByCity.size} cities`,
  );

  let query = db.collection('mealEntries');
  if (args.user) query = query.where('userId', '==', args.user);

  const mealsSnap = await query.get();
  console.log(`[backfill] scanning ${mealsSnap.size} meals`);

  let scanned = 0;
  let matched = 0;
  let applied = 0;
  let alreadyTagged = 0;

  for (const mealDoc of mealsSnap.docs) {
    scanned++;
    const meal = mealDoc.data();
    if (!meal || !meal.userId) continue;

    if (meal.iconic_eat_id) {
      alreadyTagged++;
      continue;
    }

    const city = extractMealCity(meal);
    if (!city) continue;
    if (args.city && city !== args.city) continue;

    const candidates = eatsByCity.get(city);
    if (!candidates || candidates.length === 0) continue;

    const match = findMatchingIconicEat(meal, candidates);
    if (!match) continue;

    matched++;
    console.log(
      `[backfill] MATCH meal=${mealDoc.id} user=${meal.userId} ` +
        `→ iconic=${match.id} (${match.data.dish_name} @ ${match.data.restaurant_name})`,
    );

    if (args.apply) {
      try {
        await applyIconicUnlock({
          db,
          userId: meal.userId,
          mealId: mealDoc.id,
          eatId: match.id,
          eatData: match.data,
        });
        applied++;
      } catch (err) {
        console.error(`[backfill] apply failed for meal ${mealDoc.id}:`, err);
      }
    }
  }

  console.log('\n[backfill] summary');
  console.log(`  scanned:         ${scanned}`);
  console.log(`  already tagged:  ${alreadyTagged}`);
  console.log(`  matched:         ${matched}`);
  console.log(`  applied:         ${applied}`);
  if (!args.apply && matched > 0) {
    console.log('\nRe-run with --apply to write these unlocks.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
