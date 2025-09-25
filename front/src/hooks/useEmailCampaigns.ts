import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// Define the base URL for your backend API
const API_BASE_URL = 'http://localhost:8080/api/ausbildung';

// Interface matching your backend's EmailCampaign model
export interface EmailCampaign {
  id: string;
  name: string;
  sendType: 'all' | 'individual'; // Use camelCase to match your API
  status: 'created' | 'sending' | 'completed' | 'completed_with_errors' | 'failed';
  totalEmails: number;
  sentCount: number;
  errorCount: number;
  createdAt: string;
  completedAt: string | null;
}


export const useEmailCampaigns = () => {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };
  
  // Fetches all campaigns from your API
  const fetchCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/campaigns`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      setCampaigns(data as EmailCampaign[]);
    } catch (error: any) {
      console.error('Error fetching campaigns:', error);
      toast.error('Failed to load campaigns');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Creates a new campaign using your API
  const createCampaign = async (
    name: string,
    sendType: 'all' | 'individual',
    selectedJobIds: string[],
    selectedDocumentIds: string[]
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/campaigns`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name,
          sendType,
          jobIds: selectedJobIds,
          documentIds: selectedDocumentIds,
          totalEmails: selectedJobIds.length
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to create campaign');
      }

      const newCampaign = await response.json();
      
      setCampaigns(prev => [newCampaign as EmailCampaign, ...prev]);
      toast.success('Email campaign created successfully');
      return newCampaign;

    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast.error(`Failed to create campaign: ${error.message}`);
      throw error;
    }
  };
  
  // Updates a campaign's status using your API
  const updateCampaignStatus = async (campaignId: string, status: EmailCampaign['status']) => {
    try {
      const response = await fetch(`${API_BASE_URL}/campaigns/${campaignId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status })
      });
      
      if (!response.ok) {
         const errData = await response.json();
         throw new Error(errData.error || 'Failed to update status');
      }

      const updatedCampaign = await response.json();

      setCampaigns(prev => prev.map(campaign =>
        campaign.id === campaignId ? { ...campaign, ...updatedCampaign } : campaign
      ));
      return updatedCampaign;

    } catch (error: any) {
      console.error('Error updating campaign status:', error);
      toast.error(`Failed to update status: ${error.message}`);
      throw error;
    }
  };

  // Initial fetch on component mount
  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return {
    campaigns,
    isLoading,
    createCampaign,
    updateCampaignStatus,
    refetch: fetchCampaigns // Provide a function to manually refetch data
  };
};