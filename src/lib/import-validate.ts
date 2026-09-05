/**
 * Parsing + validation for bulk import. Pure logic, no HTTP — the route calls
 * `validateImport()` for the preview AND again before committing, so the
 * commit never trusts anything the browser sends back.
 *
 * Errors fail the row (it will not be created). Warnings are advisory and the
 * row still imports. Nothing is written unless every row is valid — a
 * half-imported file is worse than a rejected one.
 */
import { prisma } from './prisma';
import {
  IMPORT_SPECS,
  type EntityKey,
  parseBoolean,
  isBooleanLike,
  isValidEmail,
  normalizeEmail,
} from './import-schema';

export interface RowResult {
  /** 1-based row number as seen in the spreadsheet (header is row 1). */
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface ValidationResult {
  entity: EntityKey;
  headers: string[];
  unknownColumns: string[];
  missingColumns: string[];
  rows: RowResult[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  /** Fatal, file-level problems — nothing can be imported. */
  fatal: string[];
}

const clean = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).replace(/‏|‎/g, '').trim();

/**
 * Validate a parsed sheet (array of row objects keyed by header).
 * Cross-checks against the database: duplicate emails, unknown teams.
 */
export async function validateImport(
  entity: EntityKey,
  rawRows: Record<string, unknown>[],
  presentHeaders: string[]
): Promise<ValidationResult> {
  const spec = IMPORT_SPECS[entity];
  const known = spec.columns.map((c) => c.key);

  const result: ValidationResult = {
    entity,
    headers: presentHeaders,
    unknownColumns: presentHeaders.filter((h) => h && !known.includes(h)),
    missingColumns: spec.columns.filter((c) => c.required && !presentHeaders.includes(c.key)).map((c) => c.key),
    rows: [],
    validCount: 0,
    errorCount: 0,
    warningCount: 0,
    fatal: [],
  };

  if (rawRows.length === 0) result.fatal.push('الملف لا يحتوي على أي صفوف بيانات.');
  if (result.missingColumns.length > 0) {
    result.fatal.push(`أعمدة إلزامية مفقودة: ${result.missingColumns.join('، ')}`);
  }
  if (result.fatal.length > 0) return result;

  // ---- per-row field checks ----
  const rows: RowResult[] = rawRows.map((raw, i) => {
    const data: Record<string, string> = {};
    for (const col of spec.columns) data[col.key] = clean(raw[col.key]);
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const col of spec.columns) {
      const value = data[col.key];
      if (col.required && value === '') {
        errors.push(`«${col.labelAr}» مطلوب`);
        continue;
      }
      if (value === '') continue;
      if (col.type === 'boolean' && !isBooleanLike(value)) {
        errors.push(`«${col.labelAr}» يجب أن يكون TRUE أو FALSE (القيمة: ${value})`);
      }
      if (col.oneOf && !col.oneOf.some((o) => o === value)) {
        const msg = `«${col.labelAr}» قيمة غير معروفة: ${value}`;
        if (col.softOneOf) warnings.push(msg);
        else errors.push(`${msg}. المسموح: ${col.oneOf.join(' / ')}`);
      }
      if (col.key === 'email' && !isValidEmail(value)) {
        errors.push(`بريد إلكتروني غير صالح: ${value}`);
      }
    }
    return { rowNumber: i + 2, data, errors, warnings }; // +2: header is row 1
  });

  // ---- duplicates inside the file ----
  const seen = new Map<string, number>();
  const dupKey = entity === 'teams' || entity === 'teams-with-leader' ? 'teamName' : 'email';
  for (const row of rows) {
    const key = dupKey === 'email' ? normalizeEmail(row.data.email || '') : (row.data.teamName || '').trim();
    if (!key) continue;
    if (seen.has(key)) row.errors.push(`مكرر داخل الملف (نفس ${dupKey === 'email' ? 'البريد' : 'اسم الفريق'} في الصف ${seen.get(key)})`);
    else seen.set(key, row.rowNumber);
  }

  // ---- cross-checks against the database ----
  const keys = Array.from(seen.keys());
  if (entity === 'mentors' && keys.length > 0) {
    const existing = await prisma.mentor.findMany({ where: { email: { in: keys } }, select: { email: true } });
    const taken = new Set(existing.map((m) => m.email.toLowerCase()));
    for (const row of rows) if (taken.has(normalizeEmail(row.data.email || ''))) row.errors.push('البريد مسجل مسبقاً كموجه');
  }

  if (entity === 'participants' && keys.length > 0) {
    const existing = await prisma.participant.findMany({ where: { email: { in: keys } }, select: { email: true } });
    const taken = new Set(existing.map((p) => p.email.toLowerCase()));
    for (const row of rows) if (taken.has(normalizeEmail(row.data.email || ''))) row.errors.push('البريد مسجل مسبقاً كمشارك');

    // every referenced team must already exist (import teams first)
    const wanted = Array.from(new Set(rows.map((r) => r.data.teamName).filter(Boolean)));
    if (wanted.length > 0) {
      const teams = await prisma.team.findMany({ where: { teamName: { in: wanted } }, select: { teamName: true } });
      const have = new Set(teams.map((t) => t.teamName));
      for (const row of rows) {
        const t = row.data.teamName;
        if (t && !have.has(t)) row.errors.push(`الفريق «${t}» غير موجود — استورد الفرق أولاً`);
      }
    }

    // exactly one leader per team, counting members already in the database
    const byTeam = new Map<string, RowResult[]>();
    for (const row of rows) {
      const t = row.data.teamName;
      if (!t) continue;
      (byTeam.get(t) ?? byTeam.set(t, []).get(t)!).push(row);
    }
    for (const [teamName, teamRows] of Array.from(byTeam.entries())) {
      const leadersInFile = teamRows.filter((r) => parseBoolean(r.data.isLeader || '') === true);
      const existingLeaders = await prisma.participant.count({
        where: { isLeader: true, team: { is: { teamName } } },
      });
      if (leadersInFile.length + existingLeaders > 1) {
        for (const r of leadersInFile) r.errors.push(`الفريق «${teamName}» له أكثر من قائد`);
      }
      if (leadersInFile.length + existingLeaders === 0) {
        for (const r of teamRows) r.warnings.push(`الفريق «${teamName}» بدون قائد`);
      }
    }
  }

  if (entity === 'teams-with-leader') {
    // Team names must be free, and each leader email must be unique in the
    // file and unused — the row creates a Team AND a Participant together.
    const names = Array.from(new Set(rows.map((r) => r.data.teamName).filter(Boolean)));
    if (names.length > 0) {
      const existingTeams = await prisma.team.findMany({ where: { teamName: { in: names } }, select: { teamName: true } });
      const takenTeams = new Set(existingTeams.map((t) => t.teamName));
      for (const row of rows) if (takenTeams.has(row.data.teamName)) row.errors.push('اسم الفريق مستخدم مسبقاً');
    }

    const emails = rows.map((r) => normalizeEmail(r.data.leaderEmail || '')).filter(Boolean);
    const seenEmail = new Map<string, number>();
    for (const row of rows) {
      const e = normalizeEmail(row.data.leaderEmail || '');
      if (!e) continue;
      if (seenEmail.has(e)) row.errors.push(`بريد القائد مكرر داخل الملف (الصف ${seenEmail.get(e)})`);
      else seenEmail.set(e, row.rowNumber);
    }
    if (emails.length > 0) {
      const existing = await prisma.participant.findMany({ where: { email: { in: emails } }, select: { email: true } });
      const taken = new Set(existing.map((p) => p.email.toLowerCase()));
      for (const row of rows) {
        if (taken.has(normalizeEmail(row.data.leaderEmail || ''))) row.errors.push('بريد القائد مسجل مسبقاً كمشارك');
      }
    }
    for (const row of rows) {
      const e = row.data.leaderEmail;
      if (e && !isValidEmail(e)) row.errors.push(`بريد قائد الفريق غير صالح: ${e}`);
    }
  }

  if (entity === 'teams' && keys.length > 0) {
    const existing = await prisma.team.findMany({ where: { teamName: { in: keys } }, select: { teamName: true } });
    const taken = new Set(existing.map((t) => t.teamName));
    for (const row of rows) if (taken.has(row.data.teamName)) row.errors.push('اسم الفريق مستخدم مسبقاً');
  }

  result.rows = rows;
  result.errorCount = rows.filter((r) => r.errors.length > 0).length;
  result.warningCount = rows.filter((r) => r.warnings.length > 0).length;
  result.validCount = rows.length - result.errorCount;
  return result;
}

/**
 * Create the rows. Caller must have confirmed `errorCount === 0`.
 * Runs in a single transaction: all rows or none.
 *
 * Forced on every record regardless of file contents:
 *   status = 'pending' · isDisabled = false · passwordHash = null
 */
export async function commitImport(entity: EntityKey, rows: RowResult[]): Promise<number> {
  const b = (v: string) => parseBoolean(v ?? '') ?? false;

  return prisma.$transaction(async (tx) => {
    if (entity === 'teams') {
      for (const r of rows) {
        await tx.team.create({
          data: {
            teamName: r.data.teamName,
            hackathonTrack: r.data.hackathonTrack,
            ideaDescription: r.data.ideaDescription || '',
            hearAboutUs: r.data.hearAboutUs || '',
            isTeamRegistration: true,
            status: 'pending',
            isDisabled: false,
            challenge: r.data.hackathonTrack, // deprecated mirror, as the public form does
          },
        });
      }
      return rows.length;
    }

    if (entity === 'mentors') {
      for (const r of rows) {
        await tx.mentor.create({
          data: {
            name: r.data.name,
            email: normalizeEmail(r.data.email),
            specialty: r.data.specialty,
            phone: r.data.phone || '',
            status: 'pending',
            isDisabled: false,
            passwordHash: null,
          },
        });
      }
      return rows.length;
    }

    if (entity === 'teams-with-leader') {
      // One row -> a Team plus its leader Participant, linked, both pending.
      for (const r of rows) {
        const team = await tx.team.create({
          data: {
            teamName: r.data.teamName,
            hackathonTrack: r.data.hackathonTrack,
            ideaDescription: r.data.ideaDescription || '',
            hearAboutUs: r.data.hearAboutUs || '',
            isTeamRegistration: true,
            status: 'pending',
            isDisabled: false,
            challenge: r.data.hackathonTrack,
          },
        });
        await tx.participant.create({
          data: {
            email: normalizeEmail(r.data.leaderEmail),
            fullName: r.data.leaderFullName,
            contactNumber: r.data.leaderContactNumber || '',
            gender: r.data.leaderGender || '',
            isUniversityStudent: b(r.data.leaderIsUniversityStudent),
            university: r.data.leaderUniversity || '',
            universityMajor: r.data.leaderUniversityMajor || '',
            professionalField: r.data.leaderProfessionalField || '',
            city: r.data.leaderCity || '',
            canAttendHackathon: b(r.data.leaderCanAttendHackathon),
            isLeader: true,
            teamId: team.id,
            status: 'pending',
            isDisabled: false,
            passwordHash: null,
          },
        });
      }
      return rows.length;
    }

    // participants
    const teamNames = Array.from(new Set(rows.map((r) => r.data.teamName).filter(Boolean)));
    const teams = teamNames.length
      ? await tx.team.findMany({ where: { teamName: { in: teamNames } }, select: { id: true, teamName: true } })
      : [];
    const teamId = new Map(teams.map((t) => [t.teamName as string, t.id]));

    for (const r of rows) {
      await tx.participant.create({
        data: {
          email: normalizeEmail(r.data.email),
          fullName: r.data.fullName,
          contactNumber: r.data.contactNumber || '',
          gender: r.data.gender || '',
          isUniversityStudent: b(r.data.isUniversityStudent),
          university: r.data.university || '',
          universityMajor: r.data.universityMajor || '',
          professionalField: r.data.professionalField || '',
          city: r.data.city || '',
          canAttendHackathon: b(r.data.canAttendHackathon),
          isLeader: b(r.data.isLeader),
          teamId: r.data.teamName ? teamId.get(r.data.teamName) ?? null : null,
          status: 'pending',
          isDisabled: false,
          passwordHash: null,
        },
      });
    }
    return rows.length;
  });
}
