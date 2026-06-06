import React from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useGetStats, useListSessions, useListDueSessions, useDeleteSession } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2, Brain, Activity, Clock, Flame } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Session } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: recentSessions, isLoading: sessionsLoading, refetch: refetchSessions } = useListSessions();
  const { data: dueSessions, isLoading: dueLoading, refetch: refetchDue } = useListDueSessions();
  
  const deleteSession = useDeleteSession();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    try {
      await deleteSession.mutateAsync({ id });
      toast({ title: "Session deleted" });
      refetchSessions();
      refetchDue();
    } catch (e) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const isLoading = statsLoading || sessionsLoading || dueLoading;

  return (
    <div className="min-h-[100dvh] w-full p-4 md:p-8 max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Training</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Review Dashboard</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1,2,3,4].map(i => <Card key={i} className="h-32 bg-card/40 border-primary/10" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Total Sessions" value={stats?.totalSessions || 0} icon={<Brain className="w-5 h-5 text-primary" />} />
          <StatsCard title="Average Score" value={stats?.averageScore ? `${stats.averageScore.toFixed(1)}/10` : '-'} icon={<Activity className="w-5 h-5 text-accent" />} />
          <StatsCard title="Topics Studied" value={stats?.topicsStudied || 0} icon={<Flame className="w-5 h-5 text-orange-500" />} />
          <StatsCard title="Due For Review" value={stats?.dueForReview || 0} icon={<Clock className="w-5 h-5 text-destructive" />} isHighlight={!!stats?.dueForReview && stats.dueForReview > 0} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 mt-8">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            Due for Review
            {dueSessions && dueSessions.length > 0 && (
              <Badge className="bg-accent text-accent-foreground ml-2">{dueSessions.length}</Badge>
            )}
          </h2>
          
          <div className="space-y-3">
            {!dueLoading && dueSessions?.length === 0 && (
              <Card className="bg-card/20 border-dashed border-primary/20">
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  You're all caught up! Great job.
                </CardContent>
              </Card>
            )}
            
            {dueSessions?.map(session => (
              <SessionCard 
                key={session.id} 
                session={session} 
                onDelete={() => handleDelete(session.id)}
                isDue
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Recent History
          </h2>
          
          <div className="space-y-3">
            {!sessionsLoading && recentSessions?.length === 0 && (
              <Card className="bg-card/20 border-dashed border-primary/20">
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  No sessions yet. Start your first training!
                </CardContent>
              </Card>
            )}
            
            {recentSessions?.map(session => (
              <SessionCard 
                key={session.id} 
                session={session} 
                onDelete={() => handleDelete(session.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, icon, isHighlight = false }: { title: string, value: string | number, icon: React.ReactNode, isHighlight?: boolean }) {
  return (
    <Card className={`bg-card/40 border-primary/20 ${isHighlight ? 'ring-1 ring-accent bg-accent/5' : ''}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-2">
          {icon}
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
        </div>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SessionCard({ session, onDelete, isDue = false }: { session: Session, onDelete: () => void, isDue?: boolean }) {
  const scoreColor = session.score >= 8 ? 'text-accent' : session.score >= 5 ? 'text-primary' : 'text-muted-foreground';
  
  return (
    <Card className={`relative group transition-all hover:border-primary/40 bg-card/60 ${isDue ? 'border-accent/40 bg-accent/5' : 'border-primary/10'}`}>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-black text-xl bg-background shadow-inner ${scoreColor} border border-primary/10`}>
          {session.score}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg truncate text-foreground/90">{session.topic}</h3>
            <Badge variant="outline" className="text-[10px] uppercase border-primary/20 text-primary/80">
              {session.difficulty}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Completed: {format(new Date(session.createdAt), 'MMM d, yyyy h:mm a')}
          </p>
          <p className="text-sm text-foreground/70 line-clamp-2 leading-relaxed">
            {session.writtenAnswer || <span className="italic text-muted-foreground">No synthesis provided.</span>}
          </p>
        </div>

        <Button 
          variant="ghost" 
          size="icon" 
          className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
          title="Delete session"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
