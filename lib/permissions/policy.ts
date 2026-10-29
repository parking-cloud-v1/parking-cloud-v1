export const FEATURES = ['monthly', 'contracts', 'attendance', 'violations', 'defects', 'reports', 'line'] as const
export type Feature = typeof FEATURES[number]
export type Access = 'none' | 'view' | 'manage'
export type PermissionProfile = { id?: string; role: string; is_active: boolean; is_system_owner?: boolean } | null
export type FeatureGrant = { feature: string; access_level: string }
export function isOwnerProfile(profile: PermissionProfile): boolean {
  return profile?.is_active === true && profile.role === 'supervisor' && profile.is_system_owner === true
}
// null grants means failed read; missing rows in a successful result preserve legacy manage access.
export function accessFor(profile: PermissionProfile, grants: readonly FeatureGrant[] | null, feature: string): Access {
  if (!FEATURES.includes(feature as Feature) || profile?.is_active !== true) return 'none'
  if (isOwnerProfile(profile) || profile.role === 'manager') return 'manage'
  if (profile.role !== 'supervisor' || grants === null) return 'none'
  const rows = grants.filter(row => row.feature === feature)
  if (!rows.length) return 'manage'
  if (rows.length !== 1) return 'none'
  const level = rows[0].access_level
  return level === 'view' || level === 'manage' ? level : 'none'
}
export function meetsAccess(actual: Access, required: 'view' | 'manage' = 'view'): boolean {
  return actual === 'manage' || (required === 'view' && actual === 'view')
}
// Drive authorization changes only this browser's OAuth cookies. It follows the
// supervisor's upload permissions; global account/settings administration stays owner-only.
export function canUseGoogleDriveOAuth(profile: PermissionProfile, levels: Pick<Record<Feature, Access>, 'reports' | 'violations'>, access: 'view' | 'manage' = 'manage'): boolean {
  return profile?.is_active === true && profile.role === 'supervisor'
    && (meetsAccess(levels.reports, access) || meetsAccess(levels.violations, access))
}
const PAGE_FEATURES: readonly [string, Feature | 'owner'][] = [
  ['/dashboard/line-recipients', 'line'],
  ['/dashboard/settings/monthly-rental-types', 'monthly'], ['/dashboard/settings', 'owner'],
  ['/dashboard/data-maintenance', 'owner'], ['/dashboard/online/audit', 'owner'], ['/dashboard/online/health', 'owner'],
  ['/dashboard/monthly-rentals', 'monthly'], ['/monthly-rentals', 'monthly'],
  ['/dashboard/online', 'contracts'], ['/contract-print', 'contracts'],
  ['/dashboard/monthly-attendance', 'attendance'], ['/dashboard/attendance-upload', 'attendance'], ['/dashboard/time-clock', 'attendance'],
  ['/dashboard/violation-parking', 'violations'], ['/dashboard/violation-alerts', 'violations'], ['/dashboard/supervision-defects', 'defects'],
  ['/dashboard/reports', 'reports'], ['/dashboard/report-center', 'reports'], ['/dashboard/accounting', 'reports'], ['/dashboard/onsite', 'reports'],
  ['/dashboard/taxi-discounts', 'reports'], ['/dashboard/disaster-inspections', 'reports'], ['/dashboard/dengue-photos', 'reports'],
  ['/dashboard/dengue-prevention', 'reports'], ['/dashboard/shift-closing', 'reports'], ['/shift-closing-report', 'reports'],
]
export function featureForPage(path: string): Feature | 'owner' | null {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/$/, '')
  return PAGE_FEATURES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))?.[1] ?? null
}
