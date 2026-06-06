import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Link } from "wouter";
import {
  useListDueSessions,
  useGenerateQuestions,
  useEvaluateAnswers,
  useSaveSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Brain, Sparkles, BookOpen, AlertCircle, RefreshCw, CheckCircle2, History } from "lucide-react";
import type { EvaluationResult } from "@workspace/api-client-react/src/generated/api.schemas";

type Step = 'start' | 'rejected' | 'reading' | 'questions' | 'writing' | 'feedback';

const INTRUSIVE_REGEX = /intrusive|unwanted|triggering|trauma|anxiety|fear|obsessive/i;

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 }
};

export default function SessionFlow() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>('start');
  
  // Session State
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Normal");
  
  const [content, setContent] = useState("");
  const [readingDone, setReadingDone] = useState(false);
  
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  
  const [writtenAnswer, setWrittenAnswer] = useState("");
  
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  // Mutations
  const generateQuestions = useGenerateQuestions();
  const evaluateAnswers = useEvaluateAnswers();
  const saveSession = useSaveSession();

  const resetSession = () => {
    setTopic("");
    setDifficulty("Normal");
    setContent("");
    setReadingDone(false);
    setQuestions([]);
    setAnswers([]);
    setWrittenAnswer("");
    setEvaluation(null);
    setStep('start');
  };

  const startSession = () => {
    if (!topic.trim()) {
      toast({ title: "Please enter a topic to begin." });
      return;
    }
    if (INTRUSIVE_REGEX.test(topic)) {
      setStep('rejected');
      return;
    }
    setStep('reading');
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-4 overflow-hidden relative">
      <AnimatePresence mode="wait">
        {step === 'start' && (
          <StartStep 
            key="start"
            topic={topic}
            setTopic={setTopic}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onStart={startSession}
          />
        )}
        
        {step === 'rejected' && (
          <RejectedStep 
            key="rejected"
            onReset={resetSession}
          />
        )}

        {step === 'reading' && (
          <ReadingStep 
            key="reading"
            topic={topic}
            difficulty={difficulty}
            content={content}
            setContent={setContent}
            readingDone={readingDone}
            setReadingDone={setReadingDone}
            onNext={() => {
              setStep('questions');
            }}
          />
        )}

        {step === 'questions' && (
          <QuestionsStep 
            key="questions"
            topic={topic}
            difficulty={difficulty}
            content={content}
            questions={questions}
            setQuestions={setQuestions}
            answers={answers}
            setAnswers={setAnswers}
            generateQuestions={generateQuestions}
            onNext={() => setStep('writing')}
          />
        )}

        {step === 'writing' && (
          <WritingStep 
            key="writing"
            topic={topic}
            difficulty={difficulty}
            content={content}
            questions={questions}
            answers={answers}
            writtenAnswer={writtenAnswer}
            setWrittenAnswer={setWrittenAnswer}
            evaluateAnswers={evaluateAnswers}
            onSuccess={(evalData) => {
              setEvaluation(evalData);
              setStep('feedback');
            }}
          />
        )}

        {step === 'feedback' && evaluation && (
          <FeedbackStep 
            key="feedback"
            topic={topic}
            difficulty={difficulty}
            writtenAnswer={writtenAnswer}
            evaluation={evaluation}
            saveSession={saveSession}
            onTryAgain={resetSession}
            onSaveAndContinue={() => setLocation('/dashboard')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------------------------
// Sub-Components
// ----------------------------------------------------------------------

function AnimatedStep({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  return (
    <motion.div
      variants={stepVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={`w-full max-w-lg mx-auto ${className}`}
    >
      {children}
    </motion.div>
  );
}

function StartStep({ topic, setTopic, difficulty, setDifficulty, onStart }: any) {
  const { data: dueSessions } = useListDueSessions();
  const dueCount = dueSessions?.length || 0;

  return (
    <AnimatedStep>
      <div className="flex flex-col items-center justify-center space-y-8 py-12">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-primary/30">
            <Brain className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Memory Trainer AI</h1>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Focus your mind. Level up your understanding. Enter a topic to begin your session.
          </p>
        </div>

        <Card className="w-full bg-card/50 backdrop-blur border-primary/20">
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">What do you want to learn?</label>
              <Input 
                autoFocus
                placeholder="e.g. Photosynthesis, React Hooks, The Roman Empire" 
                className="h-14 text-lg bg-background/50 border-primary/30 focus-visible:ring-primary"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onStart()}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Difficulty Level</label>
              <div className="grid grid-cols-3 gap-3">
                {['Easy', 'Normal', 'Hard'].map((lvl) => (
                  <Button
                    key={lvl}
                    variant={difficulty === lvl ? "default" : "outline"}
                    className={difficulty === lvl ? "bg-primary hover:bg-primary/90 text-white" : "border-primary/20 hover:bg-primary/10"}
                    onClick={() => setDifficulty(lvl)}
                  >
                    {lvl}
                  </Button>
                ))}
              </div>
            </div>

            <Button 
              className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]"
              onClick={onStart}
            >
              Start Session
            </Button>
          </CardContent>
        </Card>

        <div className="mt-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 hover:bg-secondary border border-secondary transition-colors text-sm text-foreground/80">
            <History className="w-4 h-4" />
            Review Dashboard
            {dueCount > 0 && (
              <Badge variant="default" className="bg-accent text-accent-foreground ml-2">
                {dueCount} Due
              </Badge>
            )}
          </Link>
        </div>
      </div>
    </AnimatedStep>
  );
}

function RejectedStep({ onReset }: { onReset: () => void }) {
  return (
    <AnimatedStep>
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Gentle Redirect</h2>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
              This app is designed for academic and technical topics. Let's redirect to something that will strengthen your memory in a positive way!
            </p>
          </div>
          <Button variant="outline" className="border-primary/30 hover:bg-primary/10" onClick={onReset}>
            Pick a new topic
          </Button>
        </CardContent>
      </Card>
    </AnimatedStep>
  );
}

function ReadingStep({ topic, difficulty, content, setContent, readingDone, setReadingDone, onNext }: any) {
  const { toast } = useToast();
  const streamStarted = useRef(false);

  useEffect(() => {
    if (streamStarted.current || content.length > 0) return;
    streamStarted.current = true;
    
    let isMounted = true;
    
    const fetchContent = async () => {
      try {
        const response = await fetch('/api/memory/generate-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, difficulty }),
        });
        
        if (!response.body) throw new Error("No response body");
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!isMounted) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  setContent((prev: string) => prev + data.content);
                }
                if (data.done) {
                  setReadingDone(true);
                }
              } catch (e) {
                // Ignore parse errors on incomplete chunks
              }
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          toast({ title: 'Stream Error', description: 'Could not load content completely.', variant: 'destructive' });
          setReadingDone(true);
        }
      }
    };
    
    fetchContent();
    
    return () => { isMounted = false; };
  }, [topic, difficulty, content, setContent, setReadingDone, toast]);

  return (
    <AnimatedStep className="max-w-2xl h-[90vh] flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="text-primary w-6 h-6" />
        <h2 className="text-2xl font-bold tracking-tight flex-1">Learning: {topic}</h2>
      </div>
      
      <Card className="flex-1 overflow-hidden flex flex-col bg-card/40 border-primary/20">
        <div className="flex-1 overflow-y-auto p-6 prose prose-invert prose-p:leading-relaxed prose-p:text-foreground/90 max-w-none">
          {content ? (
            <div dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br/>') }} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground space-x-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Synthesizing knowledge...</span>
            </div>
          )}
          {!readingDone && content.length > 0 && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
          )}
        </div>
      </Card>

      <div className="h-20 flex items-end justify-end mt-4">
        {readingDone && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
              onClick={onNext}
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              I've read this
            </Button>
          </motion.div>
        )}
      </div>
    </AnimatedStep>
  );
}

function QuestionsStep({ topic, difficulty, content, questions, setQuestions, answers, setAnswers, generateQuestions, onNext }: any) {
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (questions.length > 0 || fetchedRef.current) return;
    fetchedRef.current = true;
    
    generateQuestions.mutateAsync({
      data: { topic, difficulty, content }
    }).then((res: any) => {
      setQuestions(res.questions);
      setAnswers(new Array(res.questions.length).fill(""));
    }).catch(() => {
      // Handle error gently
    });
  }, [topic, difficulty, content, questions, setQuestions, setAnswers, generateQuestions]);

  const isPending = generateQuestions.isPending;

  return (
    <AnimatedStep className="max-w-2xl w-full">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="text-primary w-6 h-6" />
        <h2 className="text-2xl font-bold tracking-tight">Active Recall</h2>
      </div>

      <div className="space-y-6">
        {isPending || questions.length === 0 ? (
          <Card className="bg-card/40 border-primary/20">
            <CardContent className="p-8 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-muted-foreground">Generating targeted questions...</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {questions.map((q: string, i: number) => (
              <Card key={i} className="bg-card/60 border-primary/20 transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base leading-snug">{q}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea 
                    placeholder="Your answer..."
                    className="min-h-[80px] bg-background/50 border-0 focus-visible:ring-0 resize-none text-base"
                    value={answers[i] || ""}
                    onChange={e => {
                      const newAns = [...answers];
                      newAns[i] = e.target.value;
                      setAnswers(newAns);
                    }}
                  />
                </CardContent>
              </Card>
            ))}
            
            <Button 
              size="lg"
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-14 text-lg shadow-lg shadow-primary/20"
              onClick={onNext}
            >
              Submit Answers
            </Button>
          </div>
        )}
      </div>
    </AnimatedStep>
  );
}

function WritingStep({ topic, difficulty, content, questions, answers, writtenAnswer, setWrittenAnswer, evaluateAnswers, onSuccess }: any) {
  const { toast } = useToast();
  const handleSubmit = async () => {
    if (writtenAnswer.trim().length < 10) {
      toast({ title: "Keep going", description: "Write at least a full sentence to demonstrate your understanding." });
      return;
    }
    
    try {
      const result = await evaluateAnswers.mutateAsync({
        data: { topic, difficulty, content, questions, answers, writtenAnswer }
      });
      onSuccess(result);
    } catch (e) {
      toast({ title: "Evaluation failed", variant: "destructive" });
    }
  };

  return (
    <AnimatedStep className="max-w-2xl w-full">
       <div className="flex items-center gap-3 mb-6">
        <Brain className="text-primary w-6 h-6" />
        <h2 className="text-2xl font-bold tracking-tight">Final Synthesis</h2>
      </div>

      <Card className="bg-card/40 border-primary/20">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">Explain <span className="text-primary">{topic}</span> in your own words.</h3>
            <p className="text-muted-foreground text-sm">Keep it to 1-3 clear sentences. Pretend you're explaining it to someone else.</p>
          </div>
          
          <Textarea 
            autoFocus
            placeholder="Start typing your explanation..."
            className="min-h-[200px] text-lg leading-relaxed bg-background/50 border-primary/30 focus-visible:ring-primary resize-none"
            value={writtenAnswer}
            onChange={e => setWrittenAnswer(e.target.value)}
          />

          <Button 
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-14 text-lg shadow-lg shadow-primary/20"
            onClick={handleSubmit}
            disabled={evaluateAnswers.isPending}
          >
            {evaluateAnswers.isPending ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Evaluating...</>
            ) : "Submit Synthesis"}
          </Button>
        </CardContent>
      </Card>
    </AnimatedStep>
  );
}

function FeedbackStep({ topic, difficulty, writtenAnswer, evaluation, saveSession, onTryAgain, onSaveAndContinue }: any) {
  const { toast } = useToast();
  const [hasSaved, setHasSaved] = useState(false);
  
  const scoreColor = evaluation.score >= 8 ? 'text-accent' : evaluation.score >= 5 ? 'text-primary' : 'text-muted-foreground';

  const handleSave = async () => {
    try {
      await saveSession.mutateAsync({
        data: {
          topic,
          score: evaluation.score,
          difficulty,
          writtenAnswer,
          feedback: evaluation.feedback,
          weakPoints: evaluation.weakPoints?.join('|') || ""
        }
      });
      setHasSaved(true);
      onSaveAndContinue();
    } catch (e) {
      toast({ title: "Failed to save session", variant: "destructive" });
    }
  };

  return (
    <AnimatedStep className="max-w-2xl w-full py-8">
      <div className="text-center mb-8">
        <h2 className="text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-2">Session Complete</h2>
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className={`text-8xl font-black ${scoreColor} drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]`}
        >
          {evaluation.score}
        </motion.div>
        <p className="mt-2 text-foreground/60 font-medium">out of 10</p>
      </div>

      <div className="space-y-6">
        <Card className="bg-card/40 border-primary/20">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-2">Feedback</h3>
            <p className="text-foreground/90 leading-relaxed">{evaluation.feedback}</p>
          </CardContent>
        </Card>

        {evaluation.feynmanExplanation && (
          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold tracking-wider text-accent uppercase mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Simple Version
              </h3>
              <p className="text-foreground/90 leading-relaxed font-serif italic text-lg">
                "{evaluation.feynmanExplanation}"
              </p>
            </CardContent>
          </Card>
        )}

        {(evaluation.weakPoints?.length > 0 || evaluation.improvements?.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evaluation.weakPoints?.length > 0 && (
              <Card className="bg-destructive/5 border-destructive/20">
                <CardContent className="p-5">
                  <h3 className="text-sm font-bold text-destructive uppercase mb-3">Weak Points</h3>
                  <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/80">
                    {evaluation.weakPoints.map((wp: string, i: number) => <li key={i}>{wp}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}
            {evaluation.improvements?.length > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-5">
                  <h3 className="text-sm font-bold text-primary uppercase mb-3">How to Improve</h3>
                  <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/80">
                    {evaluation.improvements.map((imp: string, i: number) => <li key={i}>{imp}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <Button 
            variant="outline" 
            size="lg"
            className="flex-1 border-primary/30 hover:bg-primary/10 text-base"
            onClick={onTryAgain}
            disabled={saveSession.isPending || hasSaved}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Button 
            size="lg"
            className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-lg shadow-primary/20"
            onClick={handleSave}
            disabled={saveSession.isPending || hasSaved}
          >
            {saveSession.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save & Continue"}
          </Button>
        </div>
      </div>
    </AnimatedStep>
  );
}
