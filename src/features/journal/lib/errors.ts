// Unit-02 ドメイン層カスタムエラー
// API 層で HTTP ステータスコードにマッピングされる

export class JournalNotFoundError extends Error {
  readonly code = 'JOURNAL_NOT_FOUND';
  constructor(message = 'エントリが見つかりません') {
    super(message);
    this.name = 'JournalNotFoundError';
  }
}

export class TagNotFoundError extends Error {
  readonly code = 'TAG_NOT_FOUND';
  constructor(message = 'タグが見つかりません') {
    super(message);
    this.name = 'TagNotFoundError';
  }
}

export class InvalidTagReferenceError extends Error {
  readonly code = 'INVALID_TAG_REFERENCE';
  constructor(invalidTagIds: string[]) {
    super(`指定されたタグがテナントに属していません: ${invalidTagIds.join(', ')}`);
    this.name = 'InvalidTagReferenceError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'この操作を実行する権限がありません') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class SystemTagDeleteError extends Error {
  readonly code = 'SYSTEM_TAG_DELETE';
  constructor(message = 'システムデフォルトタグは削除できません') {
    super(message);
    this.name = 'SystemTagDeleteError';
  }
}
