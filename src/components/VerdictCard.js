import styles from "./VerdictCard.module.css";

const LEVEL_CLASS = {
  GO: "go",
  WAIT: "wait",
  LATE: "late",
};

// PRD §4.2 verdict 모델을 그대로 받아 색만 상태에 맞게 바꿔 그린다. 계산은 하지 않는다.
export default function VerdictCard({ level, headline, detail, window }) {
  const variant = LEVEL_CLASS[level] ?? "go";

  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.eyebrow}>DEPARTURE VERDICT</div>
      <div className={styles.status}>{headline}</div>
      <div className={styles.detail}>{detail}</div>
      {window ? <div className={styles.window}>{window}</div> : null}
    </div>
  );
}
