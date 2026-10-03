import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getLogs, clearLogs, type LogEntry } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppShellCard from '@/components/AppShellCard';
import { ArrowLeft } from 'lucide-react';

export default function LogViewerPage() {
  const { category: paramCategory } = useParams<{ category: string }>();
  const category = paramCategory || 'hedera';
  const [version, setVersion] = useState(0);
  const logs = useMemo<LogEntry[]>(() => getLogs(category), [category, version]);

  return (
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-2xl">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold">Log Viewer: {category}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setVersion(v => v + 1)}>Refresh</Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearLogs(category);
                setVersion(v => v + 1);
              }}
            >
              Clear Logs
            </Button>
          </div>
          <pre className="whitespace-pre-wrap bg-muted text-muted-foreground p-4 rounded-md overflow-auto max-h-[60vh]">
            {logs.map(l => `${new Date(l.ts).toISOString()} | ${l.message}`).join('\n')}
          </pre>
        </CardContent>
      </AppShellCard>
    </div>
  );
}
