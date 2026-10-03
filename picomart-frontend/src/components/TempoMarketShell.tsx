import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import AppShellCard from './AppShellCard';
import {CardContent,CardHeader,CardTitle} from './ui/card';
import {Button} from './ui/button';

export default function TempoMarketShell({title,children}:{title:string;children:ReactNode;seller?:boolean}){
  return <main className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
    <AppShellCard className="w-full max-w-md">
      <CardHeader className="flex flex-row items-center gap-4"><Link to="/"><Button variant="ghost" size="icon" aria-label="Back to home"><ArrowLeft className="h-5 w-5"/></Button></Link><CardTitle className="text-2xl font-bold">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        
        {children}
      </CardContent>
    </AppShellCard>
  </main>;
}
