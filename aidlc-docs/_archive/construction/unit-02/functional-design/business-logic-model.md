# Unit-02 ビジネスロジックモデル

## 対象ストーリー

| ストーリーID | タイトル | 優先度 |
|---|---|---|
| US-T-010 | 日誌エントリを作成する | Must |
| US-T-011 | 日誌エントリを編集する | Must |
| US-T-012 | 日誌エントリを削除する | Must |
| US-T-013 | エントリにタグを付ける | Must |
| US-T-014 | タイムラインで日誌を閲覧する | Must |
| US-T-020 | 感情スコアを記録する（感情カテゴリ選択で代替） | Must |
| US-T-021 | 感情カテゴリを選択する | Must |
| US-T-022 | 感情データを後から修正する | Should |

---

## 設計決定事項（確定）

| 項目 | 決定 |
|---|---|
| 記録種別 | **廃止** — タグで代替。フリーテキスト入力のみ |
| 感情スコア（数値） | **廃止** — 感情カテゴリ選択で代替 |
| 感情タグ | `tags` テーブルに統合。`is_emotion=true` フラグで識別。システムデフォルトをテナント作成時にシード |
| タグスコープ | テナント共有 — 教員誰でも作成可、テナント内全員が見える |
| タグ削除 | school_admin のみ可。削除時は紐づきを CASCADE 削除、エントリ本体は残る |
| タグ選択UI | テナント内の全タグをボタン一覧で表示。テキスト入力で新規作成も可 |
| タイムライン | ページネーション（20件/ページ） |
| エントリカード | 詳細表示（日時・本文冒頭50文字・タグ・感情カテゴリ） |
| 公開設定 | 「自分だけに保存」チェックあり→非公開、なし→タイムライン表示 |
| 文字数制限 | 200文字 |

---

## ビジネスプロセス

### BP-J-01: エントリ作成

```
入力: content, tagIds[], isPublic
前提: 認証済み教員、有効なテナント

1. content バリデーション（1〜200文字）
2. tagIds がすべて同じテナントに属することを確認
   （is_emotion=true の感情タグ・is_emotion=false の業務タグが混在可）
3. journal_entries に INSERT（is_public = !isPrivate）
4. journal_entry_tags に一括 INSERT（tagIds）
5. 作成したエントリ（タグ込み）を返却

出力: JournalEntry（タグ含む。tags.is_emotion で感情/業務を識別）
```

### BP-J-02: エントリ編集

```
入力: entryId, content, tagIds[], isPublic
前提: 認証済み教員、エントリの所有者

1. エントリの所有者確認（RLS がDB層でも強制）
2. content バリデーション（1〜200文字）
3. journal_entries を UPDATE
4. journal_entry_tags: 既存を全DELETE → 新規を一括 INSERT
5. 更新後エントリを返却

出力: JournalEntry（タグ含む）
```

### BP-J-03: エントリ削除

```
入力: entryId
前提: 認証済み教員、エントリの所有者

1. journal_entries を DELETE（CASCADE で journal_entry_tags も削除）
RLS により DB 層で所有者以外は操作不可

出力: 削除確認
```

### BP-J-04a: 教員タイムライン取得（共有フィード）

```
入力: page（1始まり）、perPage=20
前提: 認証済みユーザー（教員・管理職どちらも可）

1. journal_entries WHERE is_public=true AND tenant_id = currentTenant
2. ORDER BY created_at DESC
3. LIMIT 20 OFFSET (page-1)*20
4. 同時に COUNT(*) でトータル件数を取得
5. 各エントリに user（投稿者名）・tags（感情・業務統合）を JOIN して返却

出力: { entries: JournalEntryWithAuthor[], total: number, page: number, totalPages: number }
```

### BP-J-04b: マイ記録取得（個人ビュー）

```
入力: page（1始まり）、perPage=20
前提: 認証済み教員

1. journal_entries WHERE user_id = currentUser AND tenant_id = currentTenant
2. ORDER BY created_at DESC
3. LIMIT 20 OFFSET (page-1)*20
4. 同時に COUNT(*) でトータル件数を取得
5. 各エントリに tags（感情・業務統合）を JOIN して返却（is_public=false のエントリも含む）

出力: { entries: JournalEntry[], total: number, page: number, totalPages: number }
```

### BP-T-01: タグ作成

```
入力: name
前提: 認証済み教員

1. name バリデーション（1〜50文字）
2. 同テナント内での name 重複チェック（大文字小文字・全角半角を正規化して比較）
3. tags に INSERT（tenant_id, name, created_by）
4. 作成したタグを返却

出力: Tag
```

### BP-T-02: タグ一覧表示（フォーム用）

```
入力: tenantId
前提: 認証済みユーザー

1. GET /api/journal/tags でテナント内全タグを取得
2. name 昇順で表示
3. 選択済みタグはハイライト表示

出力: Tag[]

将来の拡張候補: 入力テキストからの自動サジェスト（形態素解析・n-gram等）
```

### BP-T-03: タグ削除（school_admin）

```
入力: tagId
前提: 認証済み school_admin、同テナントのタグ

1. タグが同テナントに属することを確認
2. is_system_default=true の場合は拒否（400 Bad Request）
3. tags から DELETE
4. journal_entry_tags の紐づきを CASCADE 削除（エントリ本体は残る）

出力: 削除確認
```

---

## 感情スコア廃止 → 感情カテゴリへの移行

US-T-020「感情スコアを記録する」は、数値スコア（1〜5）の代わりに感情カテゴリの選択（US-T-021）で代替する。

**理由**: UIモックアップで数値スコアセレクターが存在せず、「うれしい・つかれた」等のカテゴリチップで感情表現を統一する設計が確認されたため。

**Unit-04（管理職ダッシュボード）への影響**:
- 感情スコア集計の代わりに感情カテゴリの分布・頻度を集計する
- NFR-05の「感情スコアの傾向」は「感情カテゴリの分布傾向」として実装する

---

## 公開設定の Phase 対応

| 状態 | 教員タイムライン（共有） | マイ記録（個人） |
|---|---|---|
| is_public = true（デフォルト） | テナント内の全ユーザー（教員・管理職）が閲覧可 | 自分のビューに表示 |
| is_public = false（「自分だけに保存」） | 表示されない | 自分のビューに表示（所有者のみ） |

Phase 1 から共有タイムラインが機能する。スキーマ変更なしに Phase 3 の追加機能（リアクション等）を実装可能。

**NFR-05 解釈の更新**:
元の「管理職・他教員は閲覧不可」は `is_public=false` エントリへの適用。`is_public=true` はテナント内全ユーザーが閲覧可。

---

## school_admin が Unit-02 で行えること

| 機能 | 説明 |
|---|---|
| 教員タイムライン閲覧 | is_public=true の全エントリを教員と同様に閲覧 |
| タグ削除 | `is_system_default=false` のタグを削除（CASCADE・エントリ本体は残る） |

---

## 管理職の統計ビュー（Unit-04 で実装）

管理職（school_admin）には、共有タイムラインの閲覧に加え、以下の機能が存在する：

- テナント内全教員のエントリ数・感情カテゴリ分布・傾向を**統計情報として**閲覧できる
- 各教員の感情や状況の波を定性的に把握できる管理者ビューを持つ

**Unit-02 のスコープ外**。Unit-04（管理者ダッシュボード）で実装する。

**データモデルの準備**:
Unit-02 で設計した `journal_entries`・`journal_entry_tags`・`tags` テーブル（`tags.is_emotion=true` で感情タグ識別）に、Unit-04 が集計クエリを追加するだけで対応可能。スキーマ変更は不要。
