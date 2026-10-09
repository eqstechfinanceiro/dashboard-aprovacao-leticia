import { join } from 'path';

/** Raiz dos uploads multipart da remessa de folha (dentro do output dir). */
export function uploadsRoot(): string {
  return join(process.env.COMPROVANTES_OUTPUT_DIR || join(process.cwd(), 'comprovantes-output'), 'remessa-uploads');
}
