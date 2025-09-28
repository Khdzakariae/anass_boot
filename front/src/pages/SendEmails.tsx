// In your frontend file (e.g., SendEmails.jsx)

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Mail, Send, CheckCircle, ArrowLeft, Building2, MapPin, Calendar, FileCheck, Clock, Eye
} from 'lucide-react';

// Import UI Components
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// Custom Components & Hooks
import { DocumentManager } from '@/components/email/DocumentManager';

// --- API Service Functions ---
const API_BASE_URL = 'http://localhost:3000/api/ausbildung'; // Fixed URL to match backend

const api = {
  async getAusbildungen() {
    // Get jobs that are ready to send (have motivation letters but not sent yet)
    const response = await fetch(`${API_BASE_URL}/ready-to-send`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!response.ok) throw new Error('Failed to fetch ready to send jobs');
    return response.json();
  },

  async getDocuments() {
    const response = await fetch(`${API_BASE_URL}/documents`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!response.ok) throw new Error('Failed to fetch documents');
    return response.json();
  },
  
  // Updated to support selected emails and files
  async sendSelectedEmails(selectedEmails, selectedFiles, jobIds = []) {
    const response = await fetch(`${API_BASE_URL}/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        selectedEmails,
        selectedFiles,
        jobIds
      })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to send emails');
    }
    return response.json();
  }
};

const SendEmails = () => {
  const [allJobs, setAllJobs] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedJobs, setSelectedJobs] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sendingComplete, setSendingComplete] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [emailErrors, setEmailErrors] = useState([]);
  const [sentHistory, setSentHistory] = useState([]); // Simple local history

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [jobsData, documentsData] = await Promise.all([
          api.getAusbildungen(),
          api.getDocuments()
        ]);
        setAllJobs(jobsData);
        setDocuments(documentsData);
      } catch (err) {
        setError(err.message);
        toast.error(`Error fetching data: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);
  
  const readyJobs = useMemo(() => 
    allJobs.filter(job => job.motivationLetter), 
    [allJobs]
  );
  
  // Get all unique emails from selected jobs
  const availableEmails = useMemo(() => {
    const emailSet = new Set();
    readyJobs.forEach(job => {
      if (job.emails) {
        job.emails.split(',').forEach(email => {
          const cleanEmail = email.trim();
          if (cleanEmail) emailSet.add(cleanEmail);
        });
      }
    });
    return Array.from(emailSet);
  }, [readyJobs]);
  
  const handleSelectAll = (checked) => {
    setSelectedJobs(checked ? readyJobs.map(job => job.id) : []);
  };

  const handleSelectJob = (jobId, checked) => {
    setSelectedJobs(prev => checked ? [...prev, jobId] : prev.filter(id => id !== jobId));
  };

  const handleDocumentSelect = (documentId, checked) => {
    setSelectedDocuments(prev => checked ? [...prev, documentId] : prev.filter(id => id !== documentId));
  };

  const handleEmailSelect = (email, checked) => {
    setSelectedEmails(prev => checked ? [...prev, email] : prev.filter(e => e !== email));
  };

  const handleSendEmails = async () => {
    if (readyJobs.length === 0) {
      return toast.error('No jobs are ready to send.');
    }

    setIsSending(true);
    setProgress(0);
    setSendingComplete(false);
    setEmailErrors([]);

    try {
      // Simulate progress since backend sends all at once
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 15, 90));
      }, 300);

      const result = await api.sendSelectedEmails(
        selectedEmails, 
        selectedDocuments, 
        selectedJobs
      );

      clearInterval(progressInterval);
      setProgress(100);
      setSentCount(result.sentCount || 0);
      setEmailErrors(result.errors || []);
      setSendingComplete(true);
      setIsSending(false);
      
      // Add to local history
      const newHistoryEntry = {
        id: Date.now(),
        timestamp: new Date(),
        sentCount: result.sentCount || 0,
        totalJobs: selectedJobs.length || readyJobs.length,
        errorCount: (result.errors || []).length,
        status: (result.errors && result.errors.length > 0) ? 'completed_with_errors' : 'completed'
      };
      setSentHistory(prev => [newHistoryEntry, ...prev.slice(0, 4)]);
      
      // Refresh data to update job statuses
      if (result.sentCount > 0) {
        try {
          const [jobsData, documentsData] = await Promise.all([
            api.getAusbildungen(),
            api.getDocuments()
          ]);
          setAllJobs(jobsData);
          setDocuments(documentsData);
          
          // Reset selections since jobs might have been updated
          setSelectedJobs([]);
          setSelectedDocuments([]);
          setSelectedEmails([]);
          
          toast.success(`Successfully sent ${result.sentCount} emails! Job statuses updated.`);
        } catch (refreshError) {
          console.error('Failed to refresh data:', refreshError);
          toast.success(`Successfully sent ${result.sentCount} emails!`);
        }
      } else {
        toast.success(`Successfully sent ${result.sentCount} emails!`);
      }
      
      if (result.errors && result.errors.length > 0) {
        toast.warning(`${result.errors.length} emails failed. See details below.`);
      }
      
    } catch (error) {
      setIsSending(false);
      setProgress(0);
      console.error('Failed to send emails:', error);
      toast.error(`Failed to send emails: ${error.message}`);
    }
  };

  const handleReset = () => {
    setSelectedJobs([]);
    setSelectedDocuments([]);
    setSelectedEmails([]);
    setProgress(0);
    setSendingComplete(false);
    setSentCount(0);
    setEmailErrors([]);
  };
  
  // Derived state for UI logic
  const allSelected = selectedJobs.length === readyJobs.length && readyJobs.length > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center text-red-500">
          <h2 className="text-xl font-bold mb-2">Failed to Load Data</h2>
          <p>{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="sm" asChild>
                    <Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard</Link>
                </Button>
            </div>
            <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center">
                        <Mail className="h-8 w-8 text-primary-foreground" />
                    </div>
                </div>
                <h1 className="text-3xl font-display font-bold mb-2">Send Email Applications</h1>
                <p className="text-muted-foreground max-w-2xl mx-auto">Send all your personalized job applications at once. The system will automatically include your motivation letters and additional documents.</p>
            </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
            {/* Ready to Send Section */}
            <div className="lg:col-span-2 space-y-6">
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                    <Card className="shadow-elegant">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-xl font-display flex items-center gap-2">
                                        <FileCheck className="w-5 h-5 text-primary" />
                                        Ready to Send ({readyJobs.length})
                                    </CardTitle>
                                    <CardDescription>Jobs with generated motivation letters ready for application</CardDescription>
                                </div>
                                {readyJobs.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                                        <span className="text-sm text-muted-foreground">Select All</span>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {readyJobs.length === 0 ? (
                                <div className="text-center py-8">
                                    <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-lg font-medium mb-2">No Pending Applications</h3>
                                    <p className="text-muted-foreground mb-4">All your applications have been sent, or you need to generate motivation letters first.</p>
                                    <Button asChild><Link to="/generate">Generate Letters</Link></Button>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-12"></TableHead>
                                                    <TableHead>Position</TableHead>
                                                    <TableHead>Institution</TableHead>
                                                    <TableHead>Location</TableHead>
                                                    <TableHead>Start Date</TableHead>
                                                    <TableHead>Email</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {readyJobs.map((job) => (
                                                    <TableRow key={job.id} className={selectedJobs.includes(job.id) ? 'bg-muted/50' : ''}>
                                                        <TableCell><Checkbox checked={selectedJobs.includes(job.id)} onCheckedChange={(checked) => handleSelectJob(job.id, checked)} /></TableCell>
                                                        <TableCell><div className="font-medium">{job.title}</div></TableCell>
                                                        <TableCell><div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />{job.institution}</div></TableCell>
                                                        <TableCell><div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />{job.location}</div></TableCell>
                                                        <TableCell><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" />{job.startDate ? new Date(job.startDate).toLocaleDateString('de-DE') : 'N/A'}</div></TableCell>
                                                        <TableCell><div className="text-sm text-muted-foreground">{job.emails || 'No email'}</div></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    
                                    {/* Progress and Completion UI */}
                                    {isSending && (
                                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-6 space-y-4 p-4 bg-muted/30 rounded-lg">
                                        <div className="flex items-center gap-2 text-sm font-medium"><LoadingSpinner size="sm" />Sending all applications...</div>
                                        <Progress value={progress} className="w-full" />
                                        <p className="text-xs text-muted-foreground">Processing {readyJobs.length} applications...</p>
                                      </motion.div>
                                    )}

                                    {sendingComplete && (
                                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 space-y-4">
                                        <div className={`p-4 border rounded-lg ${emailErrors.length === 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'}`}>
                                          <div className={`flex items-center gap-2 font-medium mb-2 ${emailErrors.length === 0 ? 'text-green-800 dark:text-green-300' : 'text-yellow-800 dark:text-yellow-300'}`}><CheckCircle className="w-5 h-5" />Sending Completed!</div>
                                          <p className={`text-sm mb-3 ${emailErrors.length === 0 ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'}`}>Successfully sent {sentCount} emails{emailErrors.length > 0 && ` (${emailErrors.length} failed)`}</p>
                                          {emailErrors.length > 0 && (
                                            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border max-h-40 overflow-y-auto">
                                              <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Failed Emails:</h4>
                                              <ul className="text-xs text-red-700 dark:text-red-400 space-y-1">
                                                {emailErrors.map((error, index) => <li key={index}>Job ID {error.jobId}: {error.error}</li>)}
                                              </ul>
                                            </div>
                                          )}
                                          <div className="flex gap-2 mt-4">
                                            <Button asChild size="sm"><Link to="/dashboard">View Dashboard</Link></Button>
                                            <Button variant="outline" size="sm" onClick={handleReset}>Send More</Button>
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}

                                    {/* Document Selection Section */}
                                    <div className="mt-6 p-4 border rounded-lg bg-muted/30">
                                        <h4 className="font-medium mb-3 flex items-center gap-2">
                                          <FileCheck className="w-4 h-4" />
                                          Additional Documents (Optional)
                                        </h4>
                                        <p className="text-sm text-muted-foreground mb-3">
                                          Select additional documents to attach to all emails (CV and motivation letters are automatically included)
                                        </p>
                                        <DocumentManager 
                                          selectedDocuments={selectedDocuments} 
                                          onDocumentSelect={handleDocumentSelect} 
                                        />
                                        {selectedDocuments.length > 0 && (
                                          <div className="mt-2 text-sm text-primary">
                                            {selectedDocuments.length} additional document(s) will be attached
                                          </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="mt-6 flex justify-between items-center">
                                        <p className="text-sm text-muted-foreground">{readyJobs.length} applications ready to send</p>
                                        <Button 
                                          disabled={readyJobs.length === 0 || isSending || sendingComplete} 
                                          onClick={handleSendEmails}
                                          className="hero-button"
                                        >
                                          <Send className="mr-2 h-4 w-4" />
                                          Send All Applications ({readyJobs.length})
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Side Panel: Recent History & Stats */}
            <div className="space-y-6">
                {/* Recent History Card */}
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                    <Card className="shadow-elegant">
                        <CardHeader><CardTitle className="text-lg font-display flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />Recent Sends</CardTitle><CardDescription>History of your email sends</CardDescription></CardHeader>
                        <CardContent>
                            {sentHistory.length === 0 ? (<div className="text-center py-6"><Mail className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">No emails sent yet</p></div>) : (
                                <div className="space-y-3 max-h-80 overflow-y-auto">
                                  {sentHistory.map((entry) => (
                                    <div key={entry.id} className="p-3 border border-border rounded-lg">
                                      <div className="font-medium text-sm mb-1">Email Send</div>
                                      <div className="text-xs text-muted-foreground mb-2">{entry.sentCount} of {entry.totalJobs} emails sent{entry.errorCount > 0 && <span className="text-red-500 ml-2">({entry.errorCount} failed)</span>}</div>
                                      <div className="flex items-center justify-between">
                                        <div className="text-xs text-muted-foreground">{entry.timestamp.toLocaleDateString('de-DE')}</div>
                                        <Badge variant={entry.status === 'completed' ? 'default' : 'secondary'} className="text-xs">{entry.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
                
                {/* Quick Stats Card */}
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
                    <Card className="shadow-elegant">
                        <CardHeader><CardTitle className="text-lg font-display flex items-center gap-2"><Eye className="w-5 h-5 text-primary" />Quick Stats</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total Sends</span><span className="font-medium">{sentHistory.length}</span></div>
                                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Emails Sent</span><span className="font-medium">{sentHistory.reduce((sum, entry) => sum + entry.sentCount, 0)}</span></div>
                                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total Jobs Saved</span><span className="font-medium">{allJobs.length}</span></div>
                                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Documents</span><span className="font-medium">{documents.length}</span></div>
                                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground font-bold text-primary">Ready to Send</span><span className="font-bold text-primary">{readyJobs.length}</span></div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SendEmails;