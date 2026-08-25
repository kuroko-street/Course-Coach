/** Shared six-question Likert scale used by review forms and rating displays. */
export const RATING_FIELDS = [
  "satisfaction",
  "recommendation",
  "workload",
  "content",
  "teaching",
  "exam",
];

export const RATING_LABELS = {
  satisfaction: "ความพึงพอใจกับรายวิชานี้",
  recommendation: "ความต้องการแนะนำรายวิชานี้ให้กับนักศึกษาคนอื่น",
  workload: "งานและการบ้านของรายวิชานี้มีความเหมาะสม",
  content: "เนื้อหาและสื่อการสอนของรายวิชานี้มีคุณภาพ",
  teaching: "อาจารย์อธิบายเนื้อหาได้เข้าใจง่าย",
  exam: "การสอบและการให้คะแนนมีความเหมาะสมและยุติธรรม",
};

export const RATING_SHORT_LABELS = {
  satisfaction: "ความพึงพอใจ",
  recommendation: "การแนะนำรายวิชา",
  workload: "งานและการบ้าน",
  content: "เนื้อหาและสื่อการสอน",
  teaching: "การอธิบายของอาจารย์",
  exam: "การสอบและการให้คะแนน",
};

const LIKERT_OPTIONS = [
  { value: 1, label: "ไม่เห็นด้วยอย่างยิ่ง" },
  { value: 2, label: "ไม่เห็นด้วย" },
  { value: 3, label: "ปานกลาง" },
  { value: 4, label: "เห็นด้วย" },
  { value: 5, label: "เห็นด้วยอย่างยิ่ง" },
];

export function defaultRatings(source = 3) {
  return RATING_FIELDS.reduce((acc, field) => ({ ...acc, [field]: source }), {});
}

export function ratingsFromReview(review) {
  return RATING_FIELDS.reduce(
    (acc, field) => ({ ...acc, [field]: Number(review[`rating_${field}`]) }),
    {}
  );
}

export function StarDisplay({ value }) {
  const score = Number(value) || 0;
  return (
    <span className="star-display" aria-label={`${score} / 5`}>
      {"★".repeat(score)}
      {"☆".repeat(Math.max(0, 5 - score))}
    </span>
  );
}

function LikertInput({ field, label, value, onChange }) {
  return (
    <fieldset className="likert-question">
      <legend>{label}</legend>
      <div className="likert-options">
        {LIKERT_OPTIONS.map((option) => (
          <label className={`likert-option ${value === option.value ? "selected" : ""}`} key={option.value}>
            <input type="radio" name={`rating-${field}`} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span className="likert-radio" aria-hidden="true" />
            <span>{option.value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function RatingBreakdown({ ratings }) {
  return (
    <div className="rating-breakdown">
      {RATING_FIELDS.map((field) => (
        <div className="rating-row" key={field}>
          <span className="rating-label">{RATING_LABELS[field]}</span>
          <StarDisplay value={ratings[field]} />
        </div>
      ))}
    </div>
  );
}

export function RatingForm({ ratings, onChange }) {
  return (
    <div className="likert-form">
      <div className="likert-scale" aria-label="ความหมายของคะแนน">
        {LIKERT_OPTIONS.map((option) => (
          <span key={option.value}><strong>{option.value}</strong> — {option.label}</span>
        ))}
      </div>
      {RATING_FIELDS.map((field) => (
        <LikertInput key={field} field={field} label={RATING_LABELS[field]} value={ratings[field]} onChange={(score) => onChange({ ...ratings, [field]: score })} />
      ))}
    </div>
  );
}
