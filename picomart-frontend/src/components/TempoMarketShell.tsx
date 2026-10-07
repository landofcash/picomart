import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import AppShellCard from './AppShellCard';
import {CardContent,CardHeader,CardTitle} from './ui/card';
import {Button} from './ui/button';
import {cn} from '@/lib/utils';

export default function TempoMarketShell({title,children,surface='plain'}:{title:string;children:ReactNode;seller?:boolean;surface?:'plain'|'muted'}){
  return <main className="w-full flex items-start justify-center pb-2 sm:px-4 sm:pb-10">
    <AppShellCard className={cn('w-full max-w-md',surface==='muted'&&'bg-slate-50 dark:bg-background')}>
      <CardHeader className="flex flex-row items-center gap-3 px-5 sm:px-6"><Link to="/"><Button variant="ghost" size="icon" aria-label="Back to home"><ArrowLeft className="h-5 w-5"/></Button></Link><CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle></CardHeader>
      <CardContent className={cn('space-y-6 px-5 sm:px-6',surface==='muted'&&'space-y-5')}>
        
        {children}
      </CardContent>
    </AppShellCard>
  </main>;
}
