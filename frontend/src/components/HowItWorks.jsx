const steps = [
  { num: '01', title: 'Dock Intake', desc: 'Connect POS or drop a batch CSV. Received dates and expiry timestamps ingest automatically.', delay: 0 },
  { num: '02', title: 'FEFO Rotation', desc: 'Inventory ranks by days to expiry. Staff pick lists keep front displays fresh first.', delay: 0.07 },
  { num: '03', title: 'Spoilage Scoring', desc: 'ML evaluates sales velocity and weather to forecast shelf-life risks daily.', delay: 0.14 },
  { num: '04', title: 'Surplus Rescue', desc: 'Dynamic markdowns and food rescue donations trigger before waste occurs.', delay: 0.21 },
  { num: '05', title: 'Audit & ESG', desc: 'Recovery values and diverted kilograms log instantly to your sustainability ledger.', delay: 0.28 },
]

export default function HowItWorks() {
  return (
    <section className="how" id="how" aria-labelledby="how-h2">
      <div className="how__wrap">
        <div>
          <div className="how__header">
            <div>
              <h2 className="how__heading reveal" id="how-h2">
                From receipt<br />to <em>rescue,</em><br />automated.
              </h2>
              <p className="how__sub reveal" style={{ transitionDelay: '0.08s' }}>
                A continuous operational loop that closes the gap between dock intake and zero edible waste.
              </p>
            </div>
            <div className="features__visual" aria-label="FreshGuard AI Assistant">
              <div className="features__visual-inner">
                <img
                  src="/image/main/char_step.png"
                  alt="FreshGuard AI Assistant"
                  className="step__visual-img"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>

        <ol className="how__rail" role="list">
          {steps.map(step => (
            <li
              key={step.num}
              className="how__step reveal"
              style={step.delay ? { transitionDelay: `${step.delay}s` } : {}}
            >
              <div className="how__step-node" aria-hidden="true">{step.num}</div>
              <h3 className="how__step-title">{step.title}</h3>
              <p className="how__step-desc">{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
