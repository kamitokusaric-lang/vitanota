#!/bin/sh
# 山田花子 (hanako@local.test) のサンプルデータ投入
# 「先週のひとこと」AI レポートの動作確認用
#
# 投稿: 先週 4/20 (月) 〜 4/24 (金) に毎日 2 件 (朝 + 夜)、計 10 件、疲れ気味のトーン
# タスク: 10 件 (完了 3 / 進行中 3 / 未着手 4、依頼を受けた 2 / 他人へ依頼 1 含む)
#
# 安全方針:
#   - DELETE は一切しない (= 既存データを破壊しない)
#   - 学校 A (1a3de3a5-...) tenant に対して追加 only
#   - 既に hanako の投稿が学校 A にある場合は skip (= 再実行で重複追加されない)
#
# 実行: ./scripts/local/seed-hanako.sh

set -e

# 学校 A (chimo の本来 tenant)
TENANT_ID='1a3de3a5-6623-4198-b2a2-b9cb9bf5459f'

# psql 短縮ヘルパー
psql_q() {
  docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -tA -c "$1" 2>/dev/null | head -1
}

# email → user id を取得、なければ INSERT して RETURNING (既存 ID を尊重)
get_or_create_user() {
  local email="$1"
  local name="$2"
  local id
  id=$(psql_q "SELECT id FROM users WHERE email = '$email';")
  if [ -z "$id" ]; then
    id=$(psql_q "INSERT INTO users (email, name, email_verified) VALUES ('$email', '$name', NOW()) RETURNING id;")
  fi
  echo "$id"
}

echo "🌸 山田花子 (hanako@local.test) のサンプルデータを投入中..."
echo "  tenant:  ${TENANT_ID} (学校 A)"

# 各 user の actual id (既存があればそれ、なければ作成)
HANAKO_ID=$(get_or_create_user 'hanako@local.test' '山田花子')
TEACHER_ID=$(get_or_create_user 'teacher@local.test' 'ローカル教員')
ADMIN_ID=$(get_or_create_user 'admin@local.test' 'ローカル管理者')

echo "  hanako:  ${HANAKO_ID}"
echo "  teacher: ${TEACHER_ID}"
echo "  admin:   ${ADMIN_ID}"

# 既に hanako の投稿が学校 A にある場合は skip (= 再実行で重複追加されない)
EXISTING_COUNT=$(psql_q "SELECT COUNT(*) FROM journal_entries WHERE user_id = '${HANAKO_ID}' AND tenant_id = '${TENANT_ID}';")
if [ "${EXISTING_COUNT:-0}" -gt 0 ]; then
  echo ""
  echo "⚠️  hanako は学校 A に既に ${EXISTING_COUNT} 件の投稿あり。重複追加を避けるため終了します。"
  echo "    強制リセットしたい場合は手動で DELETE してから再実行してください。"
  exit 0
fi

docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev <<SQL
-- ── ロール付与 (冪等、既存あれば no-op) ──────────────────────
INSERT INTO user_tenant_roles (user_id, tenant_id, role)
VALUES
  ('${HANAKO_ID}',  '${TENANT_ID}', 'teacher'),
  ('${TEACHER_ID}', '${TENANT_ID}', 'teacher'),
  ('${ADMIN_ID}',   '${TENANT_ID}', 'school_admin')
ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

-- task_categories 冪等 INSERT (既存あれば no-op)
INSERT INTO task_categories (tenant_id, name, is_system_default, sort_order)
VALUES
  ('${TENANT_ID}'::uuid, 'クラス業務',   true, 1),
  ('${TENANT_ID}'::uuid, '教科業務',     true, 2),
  ('${TENANT_ID}'::uuid, 'イベント業務', true, 3),
  ('${TENANT_ID}'::uuid, '事務業務',     true, 4)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- RLS 用 session 変数 (vitanota は superuser だが明示的に設定)
SELECT set_config('app.tenant_id', '${TENANT_ID}', true);
SELECT set_config('app.user_id', '${HANAKO_ID}', true);

-- ── 投稿 10 件 (先週 4/20-4/24、毎日 2 件、疲れ気味のトーン) ──
-- 人名 (太郎くん / 田中先生) や クラス名 (3年2組) を意図的に混ぜて
-- マスキングの効果も確認できるようにする
-- content_masked は NULL のまま → 週次サマリ生成時に on-the-fly マスク
INSERT INTO journal_entries (tenant_id, user_id, content, mood, is_public, created_at)
VALUES
  -- 4/20 (月)
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '週末ゆっくりしたつもりが、月曜の朝からもうしんどい。3年2組の授業準備が進まない。',
   'negative'::mood_level, true, '2026-04-20 08:30:00+09'::timestamptz),
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '帰り際に保護者からの長文メール。読むだけで疲れる。',
   'negative'::mood_level, true, '2026-04-20 18:30:00+09'::timestamptz),

  -- 4/21 (火)
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '寝不足のまま出勤。今日は会議が3つ、乗り切れるか不安。',
   'very_negative'::mood_level, true, '2026-04-21 07:50:00+09'::timestamptz),
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '田中先生に頼まれた事務作業を引き受けてしまった。やっぱり断れない。',
   'negative'::mood_level, true, '2026-04-21 19:00:00+09'::timestamptz),

  -- 4/22 (水)
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '一週間の真ん中なのに、もう週末が遠く感じる。',
   'negative'::mood_level, true, '2026-04-22 08:15:00+09'::timestamptz),
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '太郎くんが教室で泣いていて、話を聞くのに時間がかかった。残ったタスクが気になる。',
   'neutral'::mood_level, true, '2026-04-22 18:00:00+09'::timestamptz),

  -- 4/23 (木)
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   'なんとか出勤。雑務に追われて本業が進まない。',
   'very_negative'::mood_level, true, '2026-04-23 08:30:00+09'::timestamptz),
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '教材準備が間に合わず明日に持ち越し。少し罪悪感。',
   'negative'::mood_level, true, '2026-04-23 19:30:00+09'::timestamptz),

  -- 4/24 (金)
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   'ようやく金曜日。でも来週もしんどそう。',
   'negative'::mood_level, true, '2026-04-24 08:00:00+09'::timestamptz),
  ('${TENANT_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '一週間が終わった安堵と、来週への不安が同居している。',
   'very_negative'::mood_level, true, '2026-04-24 18:45:00+09'::timestamptz);

-- ── タスク 10 件 ────────────────────────────────────────────────
-- 完了 3 / 進行中 3 / 未着手 4
-- 依頼を受けた (created_by ≠ hanako, owner = hanako): 2 件 (teacher / admin から)
-- 他人へ依頼   (created_by = hanako, owner ≠ hanako): 1 件 (admin に)
INSERT INTO tasks (tenant_id, category_id, owner_user_id, created_by, title, description, due_date, status, completed_at, created_at, updated_at)
VALUES
  -- 1. 完了 (4/22 done) - 自分で作成
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = 'クラス業務'),
   '${HANAKO_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '校外学習の下見報告書', '担当エリアの下見結果まとめ',
   '2026-04-22'::date, 'done'::task_status, '2026-04-22 16:00:00+09'::timestamptz,
   '2026-04-20 09:00:00+09'::timestamptz, '2026-04-22 16:00:00+09'::timestamptz),
  -- 2. 完了 (4/21 done) - 自分で作成
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = '事務業務'),
   '${HANAKO_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '教科部会の議事録共有', '前回部会の議事録を関係者に共有',
   '2026-04-21'::date, 'done'::task_status, '2026-04-21 14:00:00+09'::timestamptz,
   '2026-04-20 10:00:00+09'::timestamptz, '2026-04-21 14:00:00+09'::timestamptz),
  -- 3. 完了 (4/23 done) - admin から振られた (依頼を受けた)
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = '事務業務'),
   '${HANAKO_ID}'::uuid, '${ADMIN_ID}'::uuid,
   '校長面談の事前資料', '次回面談で使う資料の準備',
   '2026-04-23'::date, 'done'::task_status, '2026-04-23 17:30:00+09'::timestamptz,
   '2026-04-20 11:00:00+09'::timestamptz, '2026-04-23 17:30:00+09'::timestamptz),
  -- 4. 進行中 (期限来週) - 自分で作成
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = '教科業務'),
   '${HANAKO_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '中間テスト問題作成', '5/1 までに完成させる',
   '2026-05-01'::date, 'in_progress'::task_status, NULL::timestamptz,
   '2026-04-21 09:00:00+09'::timestamptz, '2026-04-24 11:00:00+09'::timestamptz),
  -- 5. 進行中 (期限今週) - teacher から振られた (依頼を受けた)
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = 'イベント業務'),
   '${HANAKO_ID}'::uuid, '${TEACHER_ID}'::uuid,
   '部活動の遠征手配', '今週末の遠征の手配最終確認',
   '2026-04-28'::date, 'in_progress'::task_status, NULL::timestamptz,
   '2026-04-22 13:00:00+09'::timestamptz, '2026-04-23 15:00:00+09'::timestamptz),
  -- 6. 進行中 (期限今週)
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = 'クラス業務'),
   '${HANAKO_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '学級通信 5 月号', '5 月号のドラフト作成',
   '2026-04-30'::date, 'in_progress'::task_status, NULL::timestamptz,
   '2026-04-22 16:00:00+09'::timestamptz, '2026-04-24 17:00:00+09'::timestamptz),
  -- 7. 未着手 (期限今週)
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = 'クラス業務'),
   '${HANAKO_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '来週月曜の保護者面談準備', '面談シート + 配布資料',
   '2026-04-27'::date, 'todo'::task_status, NULL::timestamptz,
   '2026-04-23 14:00:00+09'::timestamptz, '2026-04-23 14:00:00+09'::timestamptz),
  -- 8. 未着手 (期限今週) - teacher から振られた (依頼を受けた)
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = '教科業務'),
   '${HANAKO_ID}'::uuid, '${TEACHER_ID}'::uuid,
   '同僚作成の授業案レビュー', '田中先生の授業案にコメント',
   '2026-04-27'::date, 'todo'::task_status, NULL::timestamptz,
   '2026-04-24 11:00:00+09'::timestamptz, '2026-04-24 11:00:00+09'::timestamptz),
  -- 9. 未着手 (期限再来週)
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = '事務業務'),
   '${HANAKO_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '進路相談シートの整理', '生徒分のシート整理',
   '2026-05-02'::date, 'todo'::task_status, NULL::timestamptz,
   '2026-04-24 15:00:00+09'::timestamptz, '2026-04-24 15:00:00+09'::timestamptz),
  -- 10. 未着手 (期限なし) - hanako が admin に振った (他人へ依頼)
  ('${TENANT_ID}'::uuid,
   (SELECT id FROM task_categories WHERE tenant_id = '${TENANT_ID}'::uuid AND name = '事務業務'),
   '${ADMIN_ID}'::uuid, '${HANAKO_ID}'::uuid,
   '備品発注リストの確認', '備品担当として確認をお願いしたい',
   NULL::date, 'todo'::task_status, NULL::timestamptz,
   '2026-04-23 10:00:00+09'::timestamptz, '2026-04-23 10:00:00+09'::timestamptz);

SQL

echo ""
echo "✅ hanako@local.test のサンプルデータ投入完了 (学校 A に追加)"
echo ""
echo "投入内容:"
echo "  投稿:   10 件 (4/20-4/24 月〜金、毎日 2 件、疲れ気味)"
echo "  タスク: 10 件 (完了 3 / 進行中 3 / 未着手 4)"
echo "    依頼を受けた: 2 件"
echo "    他人へ依頼:   1 件"
