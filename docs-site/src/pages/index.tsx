import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';

const tools: {name: string; route: string; what: string}[] = [
  {name: 'Control', route: '/control', what: 'HF cache, model pull/delete, memory fit vs 128 GB'},
  {name: 'Monitor', route: '/monitor', what: 'GPU, CPU, memory gauges, process table'},
  {name: 'AutoModel', route: '/automodel', what: 'Memory estimator, inference config'},
  {name: 'Logger', route: '/logger', what: 'Experiment tracker, run metrics, loss curves'},
  {name: 'Traces', route: '/traces', what: 'Experiment trace viewer, span waterfall'},
  {name: 'Designer', route: '/designer', what: 'NeMo Data Designer, synthetic generation'},
  {name: 'Curator', route: '/curator', what: 'NeMo Curator, data curation pipelines'},
  {name: 'Datasets', route: '/datasets', what: 'Local datasets, Hub search, row preview'},
  {name: 'LangSmith', route: '/langsmith', what: 'LangChain run observability, span detail'},
  {name: 'Agents', route: '/agents', what: 'Cursor agent personas and skills browser'},
  {name: 'Agent Chat', route: '/agent', what: 'RAG assistant over the codebase'},
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <main className={styles.root}>

        <section className={styles.lead}>
          <p className={styles.desc}>
            Local-first developer dashboard for NVIDIA DGX Spark.
            Model management, GPU profiling, experiment tracking,
            synthetic data, agent observability — running on
            GB10 Grace Blackwell, 128&nbsp;GB unified,
            ~273&nbsp;GB/s, FP4.
          </p>
          <nav className={styles.nav}>
            <Link className={styles.link} to="/docs/intro">docs</Link>
            <span className={styles.sep}>/</span>
            <Link className={styles.link} to="/docs/setup">setup</Link>
            <span className={styles.sep}>/</span>
            <Link className={styles.link} to="/blog">blog</Link>
            <span className={styles.sep}>/</span>
            <Link className={styles.link} href="https://github.com/jxtngx/dgx-lab">github</Link>
          </nav>
        </section>

        <section className={styles.tools}>
          <h2 className={styles.label}>Tools</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>tool</th>
                <th>route</th>
                <th>what it does</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.name}>
                  <td className={styles.name}>{t.name}</td>
                  <td className={styles.route}>{t.route}</td>
                  <td className={styles.what}>{t.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.stack}>
          <h2 className={styles.label}>Stack</h2>
          <div className={styles.grid}>
            <dl className={styles.dl}>
              <dt>Frontend</dt><dd>Next.js 16 · Tailwind 4 · Turborepo · Bun</dd>
              <dt>Backend</dt><dd>FastAPI · Python 3.12 · uv</dd>
              <dt>Infra</dt><dd>Docker Compose · nginx</dd>
              <dt>Hardware</dt><dd>GB10 Grace Blackwell · 128 GB unified · CUDA 13.0.2</dd>
            </dl>
          </div>
        </section>

      </main>
    </Layout>
  );
}
