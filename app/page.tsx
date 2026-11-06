import Link from 'next/link';
import { ArrowDown, ArrowDownRight, ArrowUpRight, Check, Camera, Radio, Users, Fingerprint, Plus, Wallet, Sparkles } from 'lucide-react';
import Brand, { TreasureChestIcon } from './components/Brand';
import AuthAtmosphere from './components/AuthAtmosphere';
import LandingMotion from './components/LandingMotion';
import './landing.css';

function People({ small = false }: { small?: boolean }) {
 return <div className={`landing-people ${small ? 'is-small' : ''}`} aria-hidden="true"><span>A</span><span>M</span><span>R</span></div>;
}

function VaultReceipt() {
 return <div className="hero-receipt">
  <div className="receipt-top"><span className="receipt-icon"><TreasureChestIcon/></span><span className="receipt-tag">DEMO VAULT</span><span className="receipt-menu" aria-hidden="true">···</span></div>
  <div className="receipt-title">Our next chapter</div><p>A little ambition. A shared space.</p>
  <div className="receipt-rule"/>
  <div className="receipt-members"><People small/><span>3 people.<br/><strong>One shared decision.</strong></span></div>
  <div className="receipt-votes"><span><Check size={12}/> Alex</span><span><Check size={12}/> Mira</span><span className="vote-waiting">Rohan</span></div>
  <div className="receipt-bottom"><span><i/> 2 OF 3 APPROVALS</span><ArrowUpRight size={18}/></div>
 </div>;
}

export default function LandingPage() {
 return <div className="landing-site" id="top">
  <a className="landing-skip" href="#main-content">Skip to content</a>
  <header className="landing-nav"><Brand/><nav aria-label="Main navigation"><a href="#the-idea">The idea</a><a href="#how-it-works">How it works</a><Link className="landing-login" href="/login">Log in <ArrowUpRight size={14}/></Link><Link className="landing-button landing-button-blue" href="/signup">Make yourself at home <ArrowUpRight size={15}/></Link></nav></header>
  <LandingMotion>
   <main id="main-content">
    <section className="landing-hero" aria-labelledby="hero-title">
     <div className="hero-art paper-surface" data-motion-scene="hero" aria-hidden="true"><AuthAtmosphere/><div className="hero-art-label">A LITTLE MORE TOGETHER <span>01 — 03</span></div><div className="hero-art-ring ring-one"/><div className="hero-art-ring ring-two"/><div className="hero-floating-note"><span><Sparkles size={14}/></span> For everything you’re building.</div><VaultReceipt/><div className="hero-art-foot"><span>YOUR PEOPLE. YOUR SHARED SPACE.</span><span>✳</span></div></div>
     <div className="hero-copy"><div className="landing-kicker hero-kicker"><span className="landing-live-dot"/> A MORE HUMAN WAY TO SHARE</div><h1 id="hero-title"><span>Good things.</span><span>Held <em>together.</em></span></h1><div className="hero-description"><p>For the plans you make, the people you trust,<br className="desktop-break"/> and the decisions you share.</p><Link className="landing-button landing-button-blue" href="/signup">Find your shared space <ArrowUpRight size={17}/></Link><span className="hero-demo-note">An experimental prototype. Explore with test funds only.</span></div></div>
     <a href="#the-idea" className="hero-scroll"><span className="scroll-arrow"><ArrowDown size={16}/></span> A little look inside</a>
     <span className="hero-side-note" aria-hidden="true">BUILT FOR TOGETHER — TIJORI</span>
    </section>

    <section id="the-idea" className="landing-intro landing-section" data-reveal>
     <div className="landing-kicker"><span>01 / THE IDEA</span><ArrowDownRight size={20}/></div>
     <div><h2>Some things are<br/>better with <span className="inline-people"><People small/></span> your people.</h2><div className="intro-bottom"><p>A shared project. A collective rainy-day fund. The next big thing you’re figuring out together. Tijori brings the people and the decisions into one thoughtful little space.</p><a href="#the-experience" className="landing-text-link">Meet your Tijori <ArrowDownRight size={18}/></a></div></div>
    </section>

    <section id="the-experience" className="landing-experiences landing-section" aria-labelledby="experience-title">
     <div className="section-topline" data-reveal><h2 id="experience-title">A shared space.<br/>A few thoughtful touches.</h2><span className="landing-kicker">MADE FOR THE WAY WE COME TOGETHER</span></div>
     <article className="experience-row">
      <div className="experience-copy" data-reveal><span className="landing-kicker">01 / MAKE IT YOURS</span><h3>Start with<br/> the familiar.</h3><p>A name and an everyday object. Explore a different way to create a demo identity, with the object match running on your device.</p><Link href="/signup" className="landing-text-link">Try the object demo <ArrowUpRight size={18}/></Link><small>Experimental object matching. Not secure authentication or recovery.</small></div>
      <div className="experience-art object-art" data-motion-scene="object"><div className="object-grid"/><span className="art-overline">SOMETHING YOU’LL REMEMBER</span><div className="object-scan"><div className="scan-corner top-left"/><div className="scan-corner top-right"/><div className="scan-corner bottom-left"/><div className="scan-corner bottom-right"/><svg className="bottle-drawing" viewBox="0 0 100 180" aria-hidden="true"><defs><linearGradient id="bottle-glass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".9"/><stop offset="1" stopColor="#83b6fa" stopOpacity=".4"/></linearGradient></defs><path d="M37 15h26v35c0 12 17 16 17 35v65c0 11-8 17-17 17H37c-9 0-17-6-17-17V85c0-19 17-23 17-35z" fill="url(#bottle-glass)" stroke="#fff" strokeWidth="2"/><rect x="34" y="8" width="32" height="14" rx="5" fill="#fff"/><path d="M29 100h42v35H29z" fill="#f7faff"/><path d="M43 116h14M50 109v14" stroke="#6a9fe9" strokeWidth="2"/><path d="M30 83v60" stroke="#fff" strokeOpacity=".75" strokeWidth="4" strokeLinecap="round"/></svg><span className="scan-sweep" aria-hidden="true"/><span className="scan-plus plus-one">+</span><span className="scan-plus plus-two">+</span></div><div className="scan-caption"><Camera size={16}/><span>Your photo stays on your device.</span><span className="tiny-dot"/></div></div>
     </article>
     <article className="experience-row reverse">
      <div className="experience-copy" data-reveal><span className="landing-kicker">02 / BRING YOUR PEOPLE</span><h3>Many voices.<br/> One shared yes.</h3><p>Invite your people into a vault. Explore group approvals, then use a connected wallet and Safe for testnet vault signing.</p><Link href="/app" className="landing-text-link">Explore the demo <ArrowUpRight size={18}/></Link><small>Safe wallets and demo identities are separate. On-chain signing happens in Safe.</small></div>
      <div className="experience-art people-art" data-motion-scene="people"><span className="art-overline">SOMETHING WORTH BUILDING TOGETHER</span><div className="approval-sheet"><div className="approval-heading"><span className="flow-symbol"><Users size={22}/></span><span>Our next chapter<small>AN ILLUSTRATIVE GROUP</small></span></div><div className="approval-person"><span className="person-icon person-a">A</span><span>Alex<small>Let’s make it happen.</small></span><span className="approval-check"><Check size={14}/></span></div><div className="approval-person"><span className="person-icon person-m">M</span><span>Mira<small>I’m in.</small></span><span className="approval-check"><Check size={14}/></span></div><div className="approval-person"><span className="person-icon person-r">R</span><span>Rohan<small>Taking a look.</small></span><span className="approval-pending">···</span></div><div className="approval-summary"><span>2 of 3 people agree</span><span>DEMO PREVIEW <ArrowUpRight size={13}/></span></div></div></div>
     </article>
     <article className="experience-row">
      <div className="experience-copy" data-reveal><span className="landing-kicker">03 / FIND YOUR FREQUENCY</span><h3>A little signal.<br/> A moment together.</h3><p>Try a cooperative audio check with your group. Broadcast, listen, and watch two devices find the same challenge.</p><Link href="/app" className="landing-text-link">Find your signal <ArrowUpRight size={18}/></Link><small>Microphone access is opt-in. Audio checks can be replayed or relayed; they do not prove proximity or authorize transfers.</small></div>
      <div className="experience-art signal-art" data-motion-scene="signal"><span className="art-overline">ON THE SAME WAVELENGTH</span><div className="signal-illustration"><div className="signal-ring signal-ring-one"/><div className="signal-ring signal-ring-two"/><div className="signal-ring signal-ring-three"/><div className="signal-core"><Radio size={36} strokeWidth={1.3}/></div><span className="signal-person signal-person-one">A</span><span className="signal-person signal-person-two">M</span></div><div className="signal-art-caption"><span className="landing-live-dot"/> COOPERATIVE AUDIO DEMO</div></div>
     </article>
    </section>

    <section id="how-it-works" className="landing-how landing-section" data-reveal><div className="section-topline"><h2>A small beginning.<br/>A shared next chapter.</h2><Link href="/signup" className="landing-button landing-button-blue">Let’s get started <ArrowUpRight size={16}/></Link></div><div className="how-steps" data-motion-scene="steps"><div><span className="how-number">01</span><Fingerprint size={25} strokeWidth={1.4}/><h3>Make yourself at home.</h3><p>Create a demo identity with your name and a familiar object.</p></div><div><span className="how-number">02</span><Plus size={25} strokeWidth={1.4}/><h3>Bring your circle.</h3><p>Invite enrolled identities to an audio group, or wallet signers to a Safe vault.</p></div><div><span className="how-number">03</span><Wallet size={25} strokeWidth={1.4}/><h3>Explore, together.</h3><p>Try cooperative checks and shared decisions. Keep it to test funds.</p></div></div></section>

    <section id="a-note" className="landing-note landing-section" data-reveal><span className="landing-kicker">A LITTLE TRANSPARENCY</span><div><h2>A work in progress.<br/>With room to explore.</h2><p>Tijori is an experimental prototype. Object matching is a bypassable browser check, and audio matching is a cooperative demo. Neither is secure authentication. Testnet vaults use a connected wallet and Safe for signing. Please use test funds and non-sensitive information only.</p></div></section>

    <section className="landing-final paper-surface" data-motion-scene="final"><div className="landing-kicker">FOR YOUR PEOPLE. FOR WHAT’S NEXT.</div><h2><span className="final-first-line">Make room for</span><br/><span>something good.</span></h2><div className="final-bottom"><p>Start a little space.<br/>See where it takes you, together.</p><Link className="landing-button landing-button-white" href="/signup">Make yourself at home <ArrowUpRight size={18}/></Link></div><div className="final-spark" aria-hidden="true">✳</div></section>
   </main>
  </LandingMotion>
  <footer className="landing-footer"><div><Brand/><span>A LITTLE MORE TOGETHER.</span></div><nav aria-label="Footer navigation"><a href="#a-note">About this prototype</a><Link href="/login">Log in <ArrowUpRight size={13}/></Link><a href="#top">Back to top <ArrowUpRight size={13}/></a></nav><div className="footer-wordmark" aria-hidden="true">Tijori<span>✳</span></div><div className="footer-baseline"><span>BUILT FOR TOGETHER</span><span>EXPERIMENTAL BY DESIGN · TEST FUNDS ONLY</span><span>© {new Date().getFullYear()} TIJORI</span></div></footer>
 </div>;
}
