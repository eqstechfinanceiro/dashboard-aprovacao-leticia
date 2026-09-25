import { redirect } from 'next/navigation';

export default function ResultadosPage() {
  redirect('/pendencias?tab=resultados');
}
