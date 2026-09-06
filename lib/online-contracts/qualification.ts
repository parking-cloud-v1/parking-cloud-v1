export type QualificationType =
  | 'none'
  | 'resident'
  | 'teacher'
  | 'document_review'

export function qualificationTypeForRentalType(
  rentalType?: string | null
): QualificationType {
  const value = String(rentalType || '').trim()

  if (/里民|住戶/.test(value)) {
    return 'resident'
  }

  if (/老師|教職|教師/.test(value)) {
    return 'teacher'
  }

  if (/身障|身心障礙/.test(value)) {
    return 'document_review'
  }

  return 'none'
}

export function qualificationLabel(
  qualificationType?: string | null
) {
  if (qualificationType === 'resident') return '里民／住戶資格審核'
  if (qualificationType === 'teacher') return '教職員資格審核'
  if (qualificationType === 'document_review') return '資格文件人工審核'
  return '一般申請（免額外資格審核）'
}

export function qualificationHelpText(
  qualificationType?: string | null
) {
  if (qualificationType === 'resident') {
    return '聯絡地址為必填。送出申請後，由管理人員依該停車場資格規定進行人工審核。'
  }

  if (qualificationType === 'teacher') {
    return '送出申請後，由管理人員確認教職員資格。公開申請頁不要求上傳不必要的證件。'
  }

  if (qualificationType === 'document_review') {
    return '送出申請後，由管理人員依該月租資格規定人工審核。必要證明應採最小蒐集原則處理。'
  }

  return '完成手機 OTP 驗證及個資告知同意後即可送出申請。'
}
