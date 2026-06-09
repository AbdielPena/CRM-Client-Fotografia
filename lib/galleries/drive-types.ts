export interface DriveBackupStatus {
  id: string
  status: string
  track: string
  totalAssets: number
  uploadedAssets: number
  webViewLink: string | null
  sharedWithEmail: string | null
  lastError: string | null
  updatedAt: string | null
}
