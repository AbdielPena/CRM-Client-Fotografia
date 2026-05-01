// ─── Gallery feature DESHABILITADO ────────────────────────────────────────────
// La tabla `galleries` / `gallery_assets` no existe en el schema Supabase actual.
// Esta feature está diferida a fases posteriores (ver roadmap). Todas las
// funciones lanzan `GalleryFeatureDisabled` para que las rutas que las llaman
// respondan con 410 Gone en lugar de romper el build.

export class GalleryFeatureDisabled extends Error {
  constructor() {
    super("La funcionalidad de galerías está deshabilitada temporalmente.")
    this.name = "GalleryFeatureDisabled"
  }
}

const disabled = () => {
  throw new GalleryFeatureDisabled()
}

export async function getGalleries(_studioId: string, _opts: unknown = {}): Promise<never> {
  return disabled()
}

export async function getGalleryById(_studioId: string, _galleryId: string): Promise<never> {
  return disabled()
}

export async function createGallery(
  _studioId: string,
  _actorId: string,
  _data: unknown,
): Promise<never> {
  return disabled()
}

export async function updateGallery(
  _studioId: string,
  _actorId: string,
  _galleryId: string,
  _data: unknown,
): Promise<never> {
  return disabled()
}

export async function publishGallery(
  _studioId: string,
  _actorId: string,
  _galleryId: string,
): Promise<never> {
  return disabled()
}

export async function deleteGallery(
  _studioId: string,
  _actorId: string,
  _galleryId: string,
): Promise<never> {
  return disabled()
}

export async function prepareAssetUpload(
  _studioId: string,
  _galleryId: string,
  _params: unknown,
): Promise<never> {
  return disabled()
}

export async function confirmAssetUpload(
  _studioId: string,
  _assetId: string,
  _galleryId: string,
): Promise<never> {
  return disabled()
}

export async function getAssetThumbUrl(_thumbKey: string | null): Promise<null> {
  return null
}

export async function createGalleryShareToken(
  _studioId: string,
  _galleryId: string,
  _opts: unknown = {},
): Promise<never> {
  return disabled()
}

export async function shareGalleryWithClient(
  _studioId: string,
  _galleryId: string,
  _opts: unknown,
): Promise<never> {
  return disabled()
}

export async function validateGalleryToken(_token: string): Promise<null> {
  return null
}
