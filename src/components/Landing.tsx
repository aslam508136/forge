import { Cloud, Lock, Zap, Server, Shield, Database, ArrowRight, CheckCircle2 } from 'lucide-react';
import MadeByBadge from './MadeByBadge';

const features = [
  { icon: Server, title: 'Instance Management', desc: 'Start, stop, reboot, and terminate EC2 instances with one click — real AWS API calls.' },
  { icon: Zap, title: 'Launch in Seconds', desc: 'Configure and deploy compute instances with Spot support and custom storage.' },
  { icon: Database, title: 'EBS Volume Control', desc: 'Create, attach, detach, and delete EBS volumes across availability zones.' },
  { icon: Lock, title: 'Secure Credential Storage', desc: 'AWS credentials stored in Supabase database — no CLI required, fully browser-based.' },
  { icon: Shield, title: 'Multi-Account Switching', desc: 'Save unlimited AWS profiles and switch between accounts instantly.' },
  { icon: Cloud, title: 'Multi-Region Support', desc: 'Manage resources across ap-south-1, us-east-1, eu-west-1, and more.' },
];

export function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <MadeByBadge />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-sky-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Cloud size={22} className="text-white" />
          </div>
          <div><span className="text-lg font-bold">AWS EC2</span><span className="text-lg font-light text-blue-400 ml-1">Enterprise Pro</span></div>
        </div>
        <button onClick={onLaunch} className="px-5 py-2 rounded-lg bg-white text-slate-900 text-sm font-semibold hover:bg-blue-50 transition-all">Launch App</button>
      </nav>

      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Real AWS API — No CLI required
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          Manage your <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">AWS EC2</span><br />like a pro.
        </h1>
        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">A full-featured enterprise console for launching, monitoring, and controlling your EC2 instances, EBS volumes, and credentials — all from your browser.</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button onClick={onLaunch} className="group px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 text-white font-semibold shadow-xl shadow-blue-600/30 hover:shadow-blue-600/50 transition-all hover:scale-[1.03] flex items-center gap-2">
            Launch the Console <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
          <a href="#features" className="px-8 py-3.5 rounded-xl border border-white/15 text-gray-200 font-semibold hover:bg-white/5 transition-all">Explore Features</a>
        </div>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 lg:px-12 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[{ v: '4', l: 'Tabs' }, { v: '20+', l: 'Actions' }, { v: '6', l: 'Regions' }, { v: '∞', l: 'Profiles' }].map((s) => (
            <div key={s.l} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 text-center hover:border-blue-500/30 transition-colors">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-sky-400 bg-clip-text text-transparent">{s.v}</div>
              <div className="text-sm text-gray-500 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Everything you need</h2>
        <p className="text-gray-400 text-center mb-14 max-w-xl mx-auto">A complete toolkit for AWS EC2 management with real API calls.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 hover:border-blue-500/30 hover:bg-white/[0.07] transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Icon size={22} className="text-blue-400" /></div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="relative z-10 max-w-4xl mx-auto px-6 lg:px-12 py-20 text-center">
        <div className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-600/10 to-sky-600/5 p-12">
          <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-3">Ready to take control?</h2>
          <p className="text-gray-400 mb-8 max-w-lg mx-auto">Enter your real AWS credentials and start managing your infrastructure right now.</p>
          <button onClick={onLaunch} className="px-8 py-3.5 rounded-xl bg-white text-slate-900 font-semibold hover:bg-blue-50 transition-all hover:scale-[1.03] inline-flex items-center gap-2">Open the Console <ArrowRight size={18} /></button>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 py-8 px-6 lg:px-12 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-2 mb-2"><Cloud size={16} className="text-blue-400" /><span>AWS EC2 Enterprise Pro</span></div>
        <p>Built with React, Tailwind CSS & Supabase Edge Functions. Real AWS API integration.</p>
      </footer>
    </div>
  );
}
