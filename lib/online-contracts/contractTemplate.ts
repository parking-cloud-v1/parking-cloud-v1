export type ContractTemplateInput = {
  contractNo: string
  customerCode: string
  parkingLotName: string
  customerName: string
  phone: string
  address?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  vehiclePlate: string
  vehicleType: string
  rentalType?: string | null
  startDate: string
  endDate: string
  monthlyFee: number
}

export const CONTRACT_VERSION = 'V2.1'

export const CONTRACT_COMPANY = {
  name: '智驛科技有限公司',
  representative: '張詠鈞',
  phone: '(02)3234-5899',
}

function vehicleTypeText(value: string) {
  if (value === 'car') return '汽車'
  if (value === 'motorcycle') return '機車'
  if (value === 'heavy_motorcycle') return '重機'
  return value || '-'
}

function money(value: number) {
  return new Intl.NumberFormat('zh-TW').format(
    Number(value || 0)
  )
}

export function buildContractSnapshot(
  input: ContractTemplateInput
) {
  const clauses = [
    `1. 停車場名稱：${input.parkingLotName}`,
    `2. 租期：${input.startDate} 起至 ${input.endDate} 止。\n   月租金額：新臺幣 ${money(input.monthlyFee)} 元。`,
    '3. 租金：依公告金額為準，甲方調整租金時，應提前一個月公告之。',
    '4. 退租規定：月租未到期欲退租者，按日計算退回租金。',
    '5. 下期租金應於到期日之前月20日起開始繳交，相關手續費由乙方自行吸收；未按時月底前繳交者視為主動退租，本契約自行解除，本停車場有權將車位另行出租，車主不得有任何異議。',
    '6. 車輛停妥後，應即熄火，不得在停車場內逗留。',
    '7. 本停車場出租停車格供承租人車輛停放，不負任何保管及損壞賠償責任；如依法應由甲方負責者，仍依相關法令辦理。',
    '8. 氣象局發布颱風警報時，承租人需隨時注意颱風警報及大雨特報，必要時將車子駛離；若不駛離而造成損失，本公司不負任何責任，但依法不得免責者除外。',
    '9. 車輛進、出應依停車場內標誌、標線或管理人員指示方向進出；一般車輛嚴禁停放於身心障礙車位。車輛停放時，應依停車格佈設方式入格停妥，為確保安全；如有任意停放致妨礙其他車輛行進或停放者，本公司得依停車場法相關規定處理，並由乙方負擔依法得向乙方請求之必要費用；如因違規停放導致停車場內意外事故或損壞相關停車設施，乙方應依法負損害賠償責任。',
    '10. 停放車輛禁止裝載易燃、爆炸或其他危險物品進入停車場停放，否則應負擔一切因而發生之損害賠償責任。',
    '11. 乙方停放車輛時因故意或過失破壞、毀損停車場內各項停車設備者，應負損害賠償責任。',
    '12. 本契約未盡事宜，依民法租賃等法令規章辦理。契約內容如有疑義，乙方應於簽約前提出。',
    '13. 甲方如因業務需要，得於七日前以書面或電子方式通知乙方提前終止租約，並按天數比例退還未租用期間之租金；乙方應即配合遷出，不得有任何異議，亦不得要求無法律依據之損害賠償。',
    '14. 本契約採電子文件方式簽訂。乙方完成手機驗證、完整閱讀契約內容、勾選各項確認事項並完成電子簽署後，視為乙方確認契約內容及申請資料；系統將保存契約版本、簽署時間、身分驗證紀錄、文件雜湊及必要稽核紀錄。',
    '15. 依新北市公有停車場管理相關規定，月租及臨時停放車輛均應依序進入公有停車場，並依場內劃設之車格停放，且不得固定車位。違反規定者，本場得取消月租資格。',
    '16. 申請身心障礙專用停車位或相關優惠資格者，應符合相關規定；身心障礙專用停車位識別證應由符合資格者本人親自持用，或於符合規定之載送情形使用。若經查獲未依規定使用或占用身心障礙者停車位，本場得依法通報主管機關並取消月租資格。',
    '17. 承租人無次年度之優先承租權利，一律重新辦理登記及抽籤事宜。',
  ]

  const customerRows = [
    `客戶編號：${input.customerCode}`,
    `姓名：${input.customerName}`,
    `車號：${input.vehiclePlate}`,
    `車種：${vehicleTypeText(input.vehicleType)}`,
    `月租類型：${input.rentalType || '一般'}`,
    `聯絡地址：${input.address || '未填寫'}`,
    `聯絡電話：${input.phone}`,
    `緊急聯絡人：${input.emergencyContactName || '未填寫'}`,
    `緊急聯絡電話：${input.emergencyContactPhone || '未填寫'}`,
  ]

  return [
    '租用停車位合約書',
    '',
    `客戶編號：${input.customerCode}`,
    `契約編號：${input.contractNo}`,
    `契約版本：${CONTRACT_VERSION}`,
    '',
    `立契約書人：${CONTRACT_COMPANY.name}（甲方）`,
    `　　　　　　${input.customerName}（乙方）`,
    '茲為乙方租用停車位，就下列約定條款，共同遵守。',
    '',
    ...clauses,
    '',
    '立契約書人',
    `甲方：${CONTRACT_COMPANY.name}`,
    `代表人：${CONTRACT_COMPANY.representative}`,
    `電話：${CONTRACT_COMPANY.phone}`,
    '',
    `乙方：${input.customerName}`,
    '',
    '停車場客戶資料表',
    ...customerRows,
  ].join('\n')
}
