-- ============================================================
-- 0058: 研修 (workshop) — チーム振り返り (紙の「振り返り・発表シート」の画面化)
--
-- 研修の最後 12 分でチームごとに 1 枚を埋め、そのまま発表に映す。
-- 紙の配布物5 (振り返り・発表シート) の4問をそのまま持つ。
--
--   ① team_change : 1周目と3周目を比べて何が変わったか
--   ② team_moment : 「あれがなかったら今の作品はなかった」という場面
--   ③ team_motto  : チームの「コツ」= 明日から使える合言葉
--   ④ team_next   : 仕事で活かせること
--
-- 既存2テーブル (0057) との関係:
--   - workshop_checkins    : 1人1回答・本人のみ書込
--   - workshop_reflections : 個人の振り返り (公開 note を職員室へ流す)
--   - workshop_team_reflections (本 migration) : 1班1枚・チームの誰でも書込
--
-- 箱の中に閉じる (職員室に流さない):
--   journal に一切乗せない別テーブルなので、職員室/公開タイムライン/AI に
--   構造的に漏れない (0057 checkins と同じ担保)。②は他者の名指しを含むため、
--   日常に「誰が貢献したか」の記録として残さない (踏み絵)。
--
-- 箱メタ・班・設問文はコード定数 (src/features/workshop/constants.ts)。
-- RLS は 0056/0057 の app_role() CASE パターンを踏襲。
-- ============================================================

CREATE TABLE workshop_team_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL,
  -- 定数の班キー ('1'…'4')。班テーブルは作らない (参加者テーブルを作らないのと同じ方針)
  team_key TEXT NOT NULL,

  -- 4問。12分かけて少しずつ埋めるため、途中保存を許して空文字を許容する
  team_change TEXT NOT NULL DEFAULT '',
  team_moment TEXT NOT NULL DEFAULT '',
  team_motto  TEXT NOT NULL DEFAULT '',
  team_next   TEXT NOT NULL DEFAULT '',

  -- 最後に書いた人。RLS の WITH CHECK で使う。UI には出さない
  -- (「入力係が誰か」を可視化しないため)。退会・転勤時は SET NULL で匿名化。
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 1班1枚 (上書き)。team_key は定数なので、checkins (user_id がテナント固有)
  -- と違って tenant_id を UNIQUE に含めないと他テナントと衝突する。
  CONSTRAINT workshop_team_reflections_team_unique
    UNIQUE (tenant_id, workshop_id, team_key),

  CONSTRAINT workshop_team_reflections_team_key_length CHECK (
    length(team_key) > 0 AND length(team_key) <= 32
  ),
  CONSTRAINT workshop_team_reflections_length CHECK (
    length(team_change) <= 2000
    AND length(team_moment) <= 2000
    AND length(team_motto)  <= 2000
    AND length(team_next)   <= 2000
  )
);

CREATE INDEX workshop_team_reflections_tenant_idx
  ON workshop_team_reflections(tenant_id);
CREATE INDEX workshop_team_reflections_workshop_idx
  ON workshop_team_reflections(workshop_id);

ALTER TABLE workshop_team_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_team_reflections FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内 (= 参加者。箱の中で参加者同士に見える・発表で全班を映す)。
-- 職員室への非漏洩は「journal ではない別テーブル」で構造的に保証される。
CREATE POLICY workshop_team_reflections_tenant_read ON workshop_team_reflections
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- INSERT: テナント内で、updated_by は自分名義。
CREATE POLICY workshop_team_reflections_insert ON workshop_team_reflections
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND updated_by = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND updated_by = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- UPDATE: テナント内なら誰でも上書きできる (= checkins との意図的な差)。
-- チームで1枚を共同編集するため、「本人が作った行しか触れない」にすると
-- 入力係が交代できなくなる。書いた人は updated_by に残す (UI には出さない)。
CREATE POLICY workshop_team_reflections_update ON workshop_team_reflections
  FOR UPDATE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND updated_by = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND updated_by = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
