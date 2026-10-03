import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import {Card,CardContent,CardHeader,CardTitle} from './ui/card';
import {Button} from './ui/button';
export default function TempoMarketShell({title,children}:{title:string;children:ReactNode;seller?:boolean}){
  return <main className="px-4 py-8 sm:py-16"><Card className="w-full max-w-6xl mx-auto">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-2xl font-bold">{title}</CardTitle><Link to="/" className="print:hidden"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2"/>Back to Dashboard</Button></Link></div></CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card></main>;
}
