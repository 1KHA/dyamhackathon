/**
 * Manage consultant (مستشار التقييم) accounts — external evaluators who rate
 * the teams of the rating phase (/consultant-login).
 *
 * Uses DATABASE_URL from the environment. Touches only the Consultant table.
 *
 *   node scripts/create-consultant.js <username> "<display name>" [password]
 *   node scripts/create-consultant.js --reset-password <username> [password]
 *   node scripts/create-consultant.js --disable <username>
 *   node scripts/create-consultant.js --enable <username>
 *   node scripts/create-consultant.js --list
 *
 * A password is generated when none is given; it is printed once and only its
 * bcrypt hash is stored. The admin page (تقييم المستشارين ← المستشارون) can
 * do the same from the browser.
 */
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// no 0/O/1/l/I — easy to read aloud and type on a phone
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generatePassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function usage() {
  console.log(
    'usage:\n' +
      '  node scripts/create-consultant.js <username> "<display name>" [password]\n' +
      '  node scripts/create-consultant.js --reset-password <username> [password]\n' +
      '  node scripts/create-consultant.js --disable <username>\n' +
      '  node scripts/create-consultant.js --enable <username>\n' +
      '  node scripts/create-consultant.js --list'
  );
  process.exit(1);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (!cmd) usage();

  if (cmd === '--list') {
    const rows = await prisma.consultant.findMany({
      orderBy: { createdAt: 'asc' },
      select: { username: true, name: true, isDisabled: true, createdAt: true, _count: { select: { ratings: true } } },
    });
    console.table(rows.map((r) => ({ ...r, ratings: r._count.ratings, _count: undefined })));
    return;
  }

  if (cmd === '--disable' || cmd === '--enable') {
    if (!a) usage();
    await prisma.consultant.update({ where: { username: a }, data: { isDisabled: cmd === '--disable' } });
    console.log(`${a}: ${cmd === '--disable' ? 'disabled' : 'enabled'}`);
    return;
  }

  if (cmd === '--reset-password') {
    if (!a) usage();
    const password = b || generatePassword();
    await prisma.consultant.update({ where: { username: a }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    console.log(`${a}: new password: ${password}`);
    return;
  }

  if (cmd.startsWith('--')) usage();
  const username = cmd.trim();
  const name = (a || '').trim();
  if (!username || !name) usage();
  if (await prisma.consultant.findUnique({ where: { username } })) {
    console.error(`consultant "${username}" already exists — use --reset-password to change its password`);
    process.exit(1);
  }
  const password = b || generatePassword();
  await prisma.consultant.create({
    data: { username, name, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`created consultant  username: ${username}  name: ${name}  password: ${password}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
