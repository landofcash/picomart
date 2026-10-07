import {BookOpen} from 'lucide-react'
import CopyableField from '@/components/CopyableField'

export default function CatalogIdentity({seed,full=false,small=false}: {seed: string;full?:boolean;small?:boolean}) {
  return <div className="flex flex-wrap items-center gap-2 min-w-0 font-semibold" aria-label="Catalog">
    <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-label="Catalog"/>
    <CopyableField value={seed} length={full?0:20} mdLength={full?0:17} small={small} className="break-all"/>
  </div>
}
