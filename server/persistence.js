// =============================================================
// persistence.js — 계정/진행도 영구 저장 (JSON 파일, 무설치)
//   식별: 닉네임(소문자 정규화) + 비밀번호(scrypt 솔트 해시)
//   저장: data/accounts.json — 원자적 쓰기(temp→rename) + 주기적 자동저장 + 종료 시 저장
//   규모가 커지면 SQLite 등으로 교체 가능하나, 학급 규모에는 JSON으로 충분하다.
// =============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 저장 위치. 기본은 프로젝트/data 이며, MMO_DATA_DIR 로 재정의 가능(테스트 격리 등).
const DATA_DIR = process.env.MMO_DATA_DIR
  ? path.resolve(process.env.MMO_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'accounts.json');
const TMP = FILE + '.tmp';

// 비밀번호 해시 (계정별 랜덤 솔트 + scrypt)
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

class Persistence {
  constructor() {
    // nickKey -> { nick, salt, hash, level, exp, maxHp, maxMp, atk, lastSeen }
    this.accounts = {};
    this.dirty = false;
    this._timer = null;
  }

  // 닉네임 → 저장 키 (대소문자 무시, 한글은 그대로)
  static keyOf(nick) {
    return String(nick || '').trim().toLowerCase();
  }

  // 시작 시 파일 로드 (없거나 손상 시 빈 저장소로 시작)
  load() {
    try {
      const raw = fs.readFileSync(FILE, 'utf8');
      this.accounts = JSON.parse(raw) || {};
      console.log(`[저장] 계정 ${Object.keys(this.accounts).length}개 로드 (${FILE})`);
    } catch (e) {
      this.accounts = {};
      if (e.code === 'ENOENT') console.log('[저장] 기존 데이터 없음 — 새 저장소로 시작');
      else console.error('[저장] 로드 실패(빈 저장소로 시작):', e.message);
    }
    return this;
  }

  get(nickKey) {
    return this.accounts[nickKey] || null;
  }

  exists(nickKey) {
    return !!this.accounts[nickKey];
  }

  // 비밀번호 검증 (타이밍 안전 비교)
  verify(nickKey, password) {
    const rec = this.accounts[nickKey];
    if (!rec) return false;
    const a = Buffer.from(hashPassword(password, rec.salt), 'hex');
    const b = Buffer.from(rec.hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // 신규 계정 생성
  create(nickKey, nick, password, stats) {
    const salt = crypto.randomBytes(16).toString('hex');
    this.accounts[nickKey] = {
      nick,
      salt,
      hash: hashPassword(password, salt),
      level: stats.level,
      exp: stats.exp,
      maxHp: stats.maxHp,
      maxMp: stats.maxMp,
      atk: stats.atk,
      lastSeen: Date.now(),
    };
    this.dirty = true;
    return this.accounts[nickKey];
  }

  // 진행도 갱신 (비번/솔트는 유지)
  update(nickKey, nick, stats) {
    const rec = this.accounts[nickKey];
    if (!rec) return;
    rec.nick = nick;
    rec.level = stats.level;
    rec.exp = stats.exp;
    rec.maxHp = stats.maxHp;
    rec.maxMp = stats.maxMp;
    rec.atk = stats.atk;
    rec.lastSeen = Date.now();
    this.dirty = true;
  }

  // 디스크에 원자적 저장 (변경분이 있을 때만)
  flush() {
    if (!this.dirty) return;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(TMP, JSON.stringify(this.accounts));
      fs.renameSync(TMP, FILE); // 원자적 교체 — 쓰기 도중 크래시에도 원본 보존
      this.dirty = false;
    } catch (e) {
      console.error('[저장] flush 실패:', e.message);
    }
  }

  // 주기적 자동저장 (프로세스 유지에 영향 안 주도록 unref)
  startAutosave(intervalMs) {
    if (this._timer) return;
    this._timer = setInterval(() => this.flush(), intervalMs);
    if (this._timer.unref) this._timer.unref();
  }
}

module.exports = new Persistence();
