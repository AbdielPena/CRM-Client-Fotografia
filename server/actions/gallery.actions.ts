"use server"

// Galerías deshabilitadas mientras se rehace el módulo sobre Supabase Storage.
// Todas las acciones lanzan un error claro. Ver `server/services/gallery.service.ts`.

function disabled(): never {
  throw new Error("La funcionalidad de galerías está deshabilitada temporalmente.")
}

export async function createGalleryAction(_formData: FormData): Promise<void> {
  disabled()
}

export async function updateGalleryAction(
  _galleryId: string,
  _formData: FormData,
): Promise<void> {
  disabled()
}

export async function publishGalleryAction(_galleryId: string): Promise<void> {
  disabled()
}

export async function deleteGalleryAction(_galleryId: string): Promise<void> {
  disabled()
}

export async function shareGalleryAction(
  _galleryId: string,
  _formData: FormData,
): Promise<void> {
  disabled()
}
