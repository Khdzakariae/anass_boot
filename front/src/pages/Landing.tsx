import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Navbar } from '@/components/layout/Navbar';
// import { InteractiveScene } from '@/components/3d/InteractiveScene';
import { Link } from 'react-router-dom';
import { 
  Bot, 
  Zap, 
  Mail, 
  FileSearch, 
  CheckCircle, 
  ArrowRight,
  Users,
  Clock,
  Target
} from 'lucide-react';

const Landing = () => {
  const features = [
    {
      icon: FileSearch,
      title: "Smart Job Scraping",
      description: "Automatically discover and collect job opportunities from multiple sources with intelligent filtering.",
    },
    {
      icon: Bot,
      title: "AI-Powered Letters",
      description: "Generate personalized motivation letters using advanced AI that understands job requirements.",
    },
    {
      icon: Mail,
      title: "Bulk Email Sending",
      description: "Send professional applications to multiple employers efficiently with tracking capabilities.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Process hundreds of applications in minutes, not hours. Focus on what matters most.",
    },
  ];

  const stats = [
    { icon: Users, label: "Applications Sent", value: "10,000+" },
    { icon: Clock, label: "Hours Saved", value: "50,000+" },
    { icon: Target, label: "Success Rate", value: "85%" },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="container px-4 py-24 mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Automated Job Applications
                </motion.div>
                
                <h1 className="text-4xl md:text-6xl font-display font-bold leading-tight">
                  Land Your Dream Job with{" "}
                  <span className="bg-gradient-primary bg-clip-text text-transparent">
                    JobFlow
                  </span>
                </h1>
                
                <p className="text-xl text-muted-foreground max-w-xl">
                  Streamline your job search with automated scraping, AI-powered motivation letters, 
                  and bulk email sending. Apply to hundreds of positions in minutes.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" asChild className="hero-button group">
                  <Link to="/register">
                    Get Started Free
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link to="/login">Sign In</Link>
                </Button>
              </div>

              <div className="flex items-center space-x-8">
                {stats.map((stat, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 + index * 0.1 }}
                    className="text-center"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 mb-2">
                      <stat.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold font-display">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-mesh opacity-20 blur-3xl"></div>
              {/* <InteractiveScene /> */}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-card/30">
        <div className="container px-4 mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Everything You Need to Land Your Next Job
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Our comprehensive platform automates every step of the job application process.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="p-6 h-full hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container px-4 mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto space-y-8"
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold">
              Ready to Transform Your Job Search?
            </h2>
            <p className="text-xl text-muted-foreground">
              Join thousands of successful job seekers who've automated their way to their dream careers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="hero-button group">
                <Link to="/register">
                  Start Your Journey
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Landing;