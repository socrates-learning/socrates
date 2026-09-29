'use client';

// Keep these global rules mounted only with Study, at its original render position.
export function StudyModeStyles() {
  return (
        <style jsx global>{`
        .study-v2-header {
          align-items: center;
          background: linear-gradient(180deg, #061846, #041238);
          color: #ffffff;
          display: flex;
          gap: 28px;
          justify-content: space-between;
          min-height: 107px;
          padding: 26px 22px 24px;
        }

        .study-v2-brand {
          align-items: center;
          color: #ffffff;
          display: flex;
          gap: 12px;
          min-width: 320px;
        }

        .study-v2-brand-mark {
          flex: 0 0 auto;
          height: 66px;
          object-fit: contain;
          width: 76px;
        }

        .study-v2-brand strong {
          display: block;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 40px;
          font-weight: 900;
          letter-spacing: -0.055em;
          line-height: 0.95;
        }

        .study-v2-brand span {
          color: #edf4ff;
          display: block;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.03em;
          margin-top: 9px;
        }

        .study-v2-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-v2-nav-item {
          align-items: center;
          background: rgba(6, 24, 70, 0.72);
          border: 1px solid rgba(214, 224, 246, 0.36);
          border-radius: 7px;
          color: #ffffff;
          display: inline-flex;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          gap: 8px;
          min-height: 54px;
          padding: 13px 14px;
          white-space: nowrap;
        }

        .study-v2-nav-item:disabled {
          cursor: default;
          opacity: 1;
        }

        .study-v2-nav-active,
        .study-v2-nav-account {
          background: #155ee8;
          border-color: #2b71ff;
          box-shadow: 0 12px 26px rgba(21, 94, 232, 0.25);
        }

        .study-v2-nav-icon {
          display: inline-flex;
          height: 22px;
          width: 22px;
        }

        .study-v2-nav-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.1;
          width: 100%;
        }

        .study-v2-page {
          background: #f8fafc;
          min-height: calc(100vh - 107px);
          padding: 28px 24px;
        }

        .study-v2-shell {
          background: #ffffff;
          border: 1px solid #e5eaf2;
          border-radius: 8px;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
          margin: 0 auto;
          max-width: 906px;
          padding: 24px 28px;
        }

        .study-v2-card {
          background: #ffffff;
          border: 1px solid #dbe2ee;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          height: clamp(480px, calc(100vh - 235px), 640px);
          overflow: hidden;
          padding-top: 13px;
          transition:
            border-color 200ms ease,
            box-shadow 200ms ease;
        }

        .study-v2-card-front {
          cursor: pointer;
        }

        .study-v2-card-front:focus-visible {
          border-color: #0f5ee8;
          box-shadow: 0 0 0 3px rgba(15, 94, 232, 0.2);
          outline: 0;
        }

        .study-v2-card-topline {
          align-items: center;
          display: flex;
          justify-content: flex-end;
        }

        .study-v2-card-actions {
          align-items: center;
          color: #06133c;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-v2-card-actions button {
          align-items: center;
          background: transparent;
          border: 0;
          color: inherit;
          display: inline-flex;
          font: inherit;
          font-size: 17px;
          font-weight: 650;
          gap: 7px;
          min-height: 38px;
          padding: 4px 8px;
        }

        .study-v2-card-actions .study-v2-context-action {
          border: 1px solid #9fb0c9;
          border-radius: 999px;
          color: #0f5ee8;
          cursor: pointer;
          font-size: 14px;
          font-weight: 800;
          padding: 6px 12px;
        }

        .study-v2-card-actions .study-v2-context-action:hover,
        .study-v2-card-actions .study-v2-context-action:focus-visible {
          background: #eff6ff;
          border-color: #0f5ee8;
          outline: 0;
        }

        .study-v2-card-actions .study-v2-context-action:disabled {
          cursor: wait;
          opacity: 0.58;
        }

        .study-v2-card-actions .study-v2-flag-action-active {
          background: #0f5ee8;
          border-color: #0f5ee8;
          color: #ffffff;
        }

        .study-v2-card-topline {
          flex: 0 0 auto;
          padding: 0 22px;
        }

        .study-v2-question-content {
          animation: study-v2-content-in 200ms ease-out;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 24px 22px 64px;
          scrollbar-gutter: stable;
        }

        .study-v2-question-content h1 {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 43px;
          font-weight: 650;
          letter-spacing: -0.035em;
          line-height: 1.45;
          margin: auto;
          max-width: 620px;
          overflow-wrap: anywhere;
          text-align: center;
        }

        .study-v2-sr-only {
          border: 0;
          clip: rect(0 0 0 0);
          clip-path: inset(50%);
          height: 1px;
          margin: -1px;
          overflow: hidden;
          padding: 0;
          position: absolute;
          white-space: nowrap;
          width: 1px;
        }

        .study-v2-card-empty {
          cursor: default;
        }

        .study-v2-empty-state {
          align-items: center;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          padding: 56px 32px 72px;
          text-align: center;
        }

        .study-v2-empty-state h1 {
          color: #0f2f28;
          font-size: clamp(2rem, 4vw, 3.5rem);
          margin: 0;
        }

        .study-v2-empty-state p {
          color: #55706a;
          font-size: 1.05rem;
          line-height: 1.6;
          margin: 18px 0 30px;
          max-width: 540px;
        }

        .study-v2-empty-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }

        .study-v2-empty-actions button {
          background: #0f766e;
          border: 1px solid #0f766e;
          border-radius: 999px;
          color: #fff;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
          padding: 11px 20px;
        }

        .study-v2-empty-actions button:hover {
          background: #115e59;
          border-color: #115e59;
        }

        .study-v2-modal-backdrop {
          align-items: center;
          background: rgba(3, 12, 35, 0.64);
          display: flex;
          inset: 0;
          justify-content: center;
          overflow-y: auto;
          padding: 24px;
          position: fixed;
          z-index: 1000;
        }

        .study-v2-modal {
          background: #ffffff;
          border: 1px solid #dbe2ee;
          border-radius: 12px;
          box-shadow: 0 28px 70px rgba(3, 12, 35, 0.3);
          color: #08143b;
          margin: auto;
          max-width: 620px;
          overflow: hidden;
          width: 100%;
        }

        .study-v2-concept-review-modal {
          display: flex;
          flex-direction: column;
          max-height: min(760px, calc(100dvh - 48px));
          max-width: 760px;
        }

        .study-v2-concept-review-modal .study-v2-modal-header {
          flex: 0 0 auto;
        }

        .study-v2-concept-review-body {
          color: #334155;
          flex: 1 1 auto;
          line-height: 1.65;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 22px 26px 28px;
          scrollbar-gutter: stable;
        }

        .study-v2-concept-review-body h3 {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: clamp(25px, 4vw, 34px);
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 22px;
        }

        .study-v2-concept-review-body h4 {
          color: #172554;
          font-size: 17px;
          margin: 0 0 8px;
        }

        .study-v2-concept-review-body > section {
          border-top: 1px solid #e2e8f0;
          margin-top: 20px;
          padding-top: 18px;
        }

        .study-v2-concept-review-body p {
          margin: 0;
          overflow-wrap: anywhere;
        }

        .study-v2-concept-review-content .article-body > :first-child {
          margin-top: 0;
        }

        .study-v2-concept-review-content .article-body > :last-child {
          margin-bottom: 0;
        }

        .study-v2-concept-review-content img {
          height: auto;
          max-width: 100%;
        }

        .study-v2-concept-review-empty {
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          color: #64748b;
          padding: 14px;
        }

        .study-v2-concept-review-sources > div {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-top: 10px;
          padding: 12px 14px;
        }

        .study-v2-concept-review-sources p {
          color: #64748b;
          font-size: 14px;
          margin-top: 4px;
        }

        .study-v2-concept-review-sources a {
          color: #0f5ee8;
          display: inline-block;
          font-weight: 750;
          margin-top: 7px;
          overflow-wrap: anywhere;
        }

        .study-v2-concept-review-status {
          color: #475569;
          margin: 0;
          text-align: center;
        }

        .study-v2-concept-review-status button {
          background: #0f5ee8;
          border: 1px solid #0f5ee8;
          border-radius: 999px;
          color: #ffffff;
          cursor: pointer;
          font: inherit;
          font-weight: 800;
          margin-top: 14px;
          min-height: 40px;
          padding: 8px 16px;
        }

        .study-v2-flag-modal {
          max-width: 520px;
        }

        .study-v2-modal-header {
          align-items: flex-start;
          border-bottom: 1px solid #dbe2ee;
          display: flex;
          gap: 18px;
          justify-content: space-between;
          padding: 20px 22px 16px;
        }

        .study-v2-modal-header p {
          color: #0f5ee8;
          font-size: 12px;
          font-weight: 850;
          letter-spacing: 0.08em;
          margin: 0 0 4px;
          text-transform: uppercase;
        }

        .study-v2-modal-header h2 {
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 28px;
          letter-spacing: -0.035em;
          margin: 0;
        }

        .study-v2-modal-header > button {
          background: transparent;
          border: 0;
          color: #334155;
          cursor: pointer;
          font: inherit;
          font-size: 34px;
          line-height: 1;
          padding: 0;
        }

        .study-v2-modal-form {
          display: grid;
          gap: 14px;
          padding: 18px 22px 22px;
        }

        .study-v2-modal-form label {
          color: #172554;
          display: grid;
          font-size: 14px;
          font-weight: 800;
          gap: 6px;
        }

        .study-v2-modal-form label small {
          color: #64748b;
          font-weight: 650;
        }

        .study-v2-modal-form input,
        .study-v2-modal-form select,
        .study-v2-modal-form textarea {
          background: #ffffff;
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          color: #0f172a;
          font: inherit;
          line-height: 1.4;
          min-height: 42px;
          padding: 9px 11px;
          width: 100%;
        }

        .study-v2-modal-form textarea {
          min-height: 82px;
          resize: vertical;
        }

        .study-v2-modal-form input:focus,
        .study-v2-modal-form select:focus,
        .study-v2-modal-form textarea:focus {
          border-color: #0f5ee8;
          box-shadow: 0 0 0 3px rgba(15, 94, 232, 0.14);
          outline: 0;
        }

        .study-v2-read-only-context,
        .study-v2-read-only-field {
          background: #f8fafc;
          border: 1px solid #dbe2ee;
          border-radius: 8px;
          display: grid;
          gap: 4px;
          padding: 12px 14px;
        }

        .study-v2-read-only-context span,
        .study-v2-read-only-field span {
          color: #64748b;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .study-v2-read-only-context strong,
        .study-v2-read-only-field strong {
          line-height: 1.35;
        }

        .study-v2-read-only-context small,
        .study-v2-read-only-field small {
          color: #64748b;
        }

        .study-v2-private-explainer,
        .study-v2-destination-fields > p {
          color: #475569;
          font-size: 13px;
          line-height: 1.5;
          margin: 0;
        }

        .study-v2-destination-fields {
          display: grid;
          gap: 12px;
        }

        .study-v2-modal-warning {
          background: #fffbeb;
          border: 1px solid #f3d48a;
          border-radius: 8px;
          color: #713f12;
          padding: 12px 14px;
        }

        .study-v2-modal-warning p {
          font-size: 13px;
          line-height: 1.45;
          margin: 5px 0 9px;
        }

        .study-v2-modal-warning a {
          color: #0f5ee8;
          font-weight: 800;
        }

        .study-v2-modal-footer {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          justify-content: flex-end;
          padding-top: 2px;
        }

        .study-v2-modal-footer p {
          color: #b91c1c;
          flex: 1 1 180px;
          font-size: 13px;
          margin: 0;
        }

        .study-v2-modal-footer button {
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          cursor: pointer;
          font: inherit;
          font-weight: 800;
          min-height: 40px;
          padding: 8px 13px;
        }

        .study-v2-modal-footer button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .study-v2-modal-secondary {
          background: #ffffff;
          color: #0f5ee8;
        }

        .study-v2-modal-primary {
          background: #0f5ee8;
          border-color: #0f5ee8 !important;
          color: #ffffff;
        }

        .study-v2-modal-danger {
          background: #ffffff;
          border-color: #dc2626 !important;
          color: #b91c1c;
        }

        .study-v2-action-status {
          height: 1px;
          margin: -1px;
          overflow: hidden;
          padding: 0;
          position: absolute;
          width: 1px;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
        }

        @keyframes study-v2-content-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .study-v2-submission-status {
          background: #f0f5ff;
          border-bottom: 1px solid #dbe2ee;
          padding: 16px 22px;
        }

        .study-v2-submission-status p {
          margin: 0 0 12px;
        }

        .study-v2-submission-status button + button {
          margin-left: 8px;
        }

        .study-v2-answer-body {
          animation: study-v2-content-in 200ms ease-out;
          color: #08143b;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 28px clamp(28px, 8vw, 88px) 32px;
          scrollbar-gutter: stable;
        }

        .study-v2-answer-section,
        .study-v2-explanation-section,
        .study-v2-revealed-question,
        .study-v2-review-concept-action {
          margin: 0 auto;
          max-width: 680px;
        }

        .study-v2-revealed-question {
          border-bottom: 1px solid #dbe2ee;
          margin-bottom: 24px;
          padding-bottom: 20px;
        }

        .study-v2-revealed-question > p {
          color: #64748b;
          font-size: 12px;
          font-weight: 850;
          letter-spacing: 0.08em;
          margin: 0 0 7px;
          text-transform: uppercase;
        }

        .study-v2-revealed-question h2 {
          color: #334155;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: clamp(17px, 2vw, 21px);
          font-weight: 650;
          letter-spacing: -0.015em;
          line-height: 1.45;
          margin: 0;
          overflow-wrap: anywhere;
        }

        .study-v2-answer-section h1,
        .study-v2-explanation-section h2 {
          font-family: Georgia, "Times New Roman", Times, serif;
          letter-spacing: -0.035em;
          margin: 0 0 14px;
        }

        .study-v2-answer-section h1 {
          color: #0f5ee8;
          font-size: 24px;
          font-weight: 750;
        }

        .study-v2-answer-section p {
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: clamp(25px, 3vw, 34px);
          font-weight: 600;
          letter-spacing: -0.025em;
          line-height: 1.3;
          margin: 0;
        }

        .study-v2-explanation-section {
          border-top: 1px solid #dbe2ee;
          margin-top: 28px;
          padding-top: 24px;
        }

        .study-v2-explanation-section h2 {
          font-size: 21px;
          font-weight: 700;
        }

        .study-v2-explanation-section p {
          color: #334155;
          font-size: 18px;
          line-height: 1.65;
          margin: 0;
        }

        .study-v2-review-concept-action {
          border-top: 1px solid #dbe2ee;
          margin-top: 28px;
          padding-top: 22px;
        }

        .study-v2-review-concept-action button {
          background: #ffffff;
          border: 1px solid #0f5ee8;
          border-radius: 999px;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 800;
          min-height: 42px;
          padding: 9px 18px;
        }

        .study-v2-review-concept-action button:hover,
        .study-v2-review-concept-action button:focus-visible {
          background: #eff6ff;
          outline: 0;
        }

        .study-v2-feedback-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          flex: 0 0 auto;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          min-height: 80px;
        }

        .study-v2-feedback-row-personal {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .study-v2-feedback-row button {
          align-items: center;
          background: transparent;
          border: 0;
          border-right: 1px solid #dbe2ee;
          color: #08143b;
          cursor: pointer;
          display: flex;
          font: inherit;
          font-size: 16px;
          font-weight: 800;
          justify-content: center;
          min-height: 80px;
          padding: 12px 16px;
        }

        .study-v2-feedback-row button:last-child {
          border-right: 0;
        }

        .study-v2-feedback-row button:hover,
        .study-v2-feedback-row button:focus-visible {
          background: #eff6ff;
          outline: 0;
        }

        .study-v2-feedback-active {
          background: #eff6ff !important;
        }

        .study-v2-feedback-emoji {
          align-items: center;
          display: inline-flex;
          font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
          font-size: 24px;
          height: 30px;
          justify-content: center;
          line-height: 1;
          width: 30px;
        }

        .study-v2-other-label {
          color: #0f5ee8;
          font-family: system-ui, sans-serif;
          font-size: 16px;
          font-weight: 800;
          line-height: 1.2;
        }

        .study-v2-more-panel {
          background: #f8fafc;
          border-top: 1px solid #dbe2ee;
          flex: 0 0 auto;
          max-height: 270px;
          overflow-y: auto;
        }

        .study-v2-more-choice-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 96px;
        }

        .study-v2-more-choice-row button {
          background: #ffffff;
          border: 0;
          border-right: 1px solid #dbe2ee;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 750;
          padding: 18px;
        }

        .study-v2-more-choice-row button:last-child {
          border-right: 0;
        }

        .study-v2-more-form {
          display: grid;
          gap: 10px;
          padding: 14px 18px 16px;
        }

        .study-v2-more-form label {
          color: #08143b;
          display: grid;
          font-size: 15px;
          font-weight: 700;
          gap: 7px;
        }

        .study-v2-more-form textarea {
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          color: #0f172a;
          font: inherit;
          line-height: 1.4;
          min-height: 76px;
          padding: 9px 11px;
          resize: vertical;
          width: 100%;
        }

        .study-v2-more-form textarea:focus {
          border-color: #0f5ee8;
          box-shadow: 0 0 0 3px rgba(15, 94, 232, 0.14);
          outline: 0;
        }

        .study-v2-more-form-footer {
          align-items: center;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-v2-more-form-footer p {
          color: #b91c1c;
          flex: 1;
          font-size: 14px;
          margin: 0;
        }

        .study-v2-more-form-footer button {
          background: #ffffff;
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 750;
          min-height: 38px;
          padding: 8px 14px;
        }

        .study-v2-more-form-footer button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .study-v2-more-form-footer .study-v2-more-submit {
          background: #0f5ee8;
          border-color: #0f5ee8;
          color: #ffffff;
        }

        .study-v2-more-confirmation {
          align-items: center;
          color: #166534;
          display: flex;
          font-weight: 750;
          justify-content: center;
          margin: 0;
          min-height: 96px;
          padding: 20px;
          text-align: center;
        }

        .study-v2-response-toolbar {
          align-items: center;
          border-top: 1px solid #dbe2ee;
          display: flex;
          flex: 0 0 auto;
          gap: 18px;
          min-height: 64px;
          padding: 12px 20px;
        }

        .study-v2-response-toolbar p {
          color: #475569;
          flex: 1;
          margin: 0;
          text-align: center;
        }

        .study-v2-response-back {
          background: transparent;
          border: 0;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }

        .study-v2-rating-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 148px;
        }

        .study-v2-rating-button {
          align-items: center;
          border: 0;
          border-right: 1px solid #dbe2ee;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          font: inherit;
          font-family: Georgia, "Times New Roman", Times, serif;
          gap: 12px;
          justify-content: center;
          padding: 24px;
        }

        .study-v2-rating-button:last-child {
          border-right: 0;
        }

        .study-v2-rating-button strong {
          font-size: 26px;
        }

        .study-v2-rating-button span {
          color: #334155;
          font-family: system-ui, sans-serif;
          font-size: 16px;
          font-weight: 600;
        }

        .study-v2-rating-easy {
          background: #f0fdf4;
          color: #2f8f46;
        }

        .study-v2-rating-average {
          background: #fffbeb;
          color: #9a6c00;
        }

        .study-v2-rating-hard {
          background: #fff7ed;
          color: #e3642a;
        }

        .study-v2-rating-didnt_know {
          background: #fff1f2;
          color: #be123c;
        }

        .study-v2-rating-forgot {
          background: #fff7ed;
          color: #c2410c;
        }

        .study-v2-rating-too_hard {
          background: #fef2f2;
          color: #b91c1c;
        }

        .study-v2-rating-active {
          box-shadow: inset 0 0 0 3px currentColor;
        }

        .study-v2-cram {
          align-items: center;
          color: #08143b;
          display: flex;
          font-size: 24px;
          gap: 16px;
          justify-content: flex-end;
          margin: 34px 16px 0 0;
        }

        .study-v2-cram input {
          accent-color: #0f5ee8;
          height: 25px;
          width: 25px;
        }

        @media (max-width: 900px) {
          .study-v2-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .study-v2-brand-mark {
            height: 48px;
            width: 55px;
          }

          .study-v2-nav {
            justify-content: flex-start;
          }

          .study-v2-page {
            padding: 24px 14px 36px;
          }

          .study-v2-shell {
            padding: 24px 14px;
          }

          .study-v2-card {
            height: min(620px, 72dvh);
            min-height: 500px;
          }

          .study-v2-question-content h1 {
            font-size: 33px;
          }

          .study-v2-answer-body {
            padding: 24px 22px 28px;
          }

          .study-v2-card-topline {
            justify-content: flex-end;
          }

          .study-v2-card-actions {
            justify-content: flex-end;
          }

          .study-v2-modal-backdrop {
            align-items: flex-start;
            padding: 12px;
          }

          .study-v2-modal-header {
            padding: 16px 16px 13px;
          }

          .study-v2-modal-header h2 {
            font-size: 24px;
          }

          .study-v2-concept-review-body {
            padding: 18px 18px 22px;
          }

          .study-v2-modal-form {
            gap: 12px;
            padding: 14px 16px 16px;
          }

          .study-v2-modal-form textarea {
            min-height: 72px;
          }

          .study-v2-modal-footer {
            align-items: stretch;
          }

          .study-v2-modal-footer p {
            flex-basis: 100%;
          }

          .study-v2-more-choice-row {
            grid-template-columns: 1fr;
          }

          .study-v2-more-choice-row button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 52px;
            padding: 12px 16px;
          }

          .study-v2-more-choice-row button:last-child {
            border-bottom: 0;
          }

          .study-v2-more-form-footer {
            flex-wrap: wrap;
          }

          .study-v2-more-form-footer p {
            flex-basis: 100%;
          }

          .study-v2-rating-row {
            grid-template-columns: 1fr;
          }

          .study-v2-rating-button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 140px;
          }
        }

        @media (max-width: 520px) {
          .study-v2-page {
            padding: 12px 7px 24px;
          }

          .study-v2-shell {
            padding: 10px 7px;
          }

          .study-v2-card {
            height: min(620px, 74dvh);
            min-height: 470px;
          }

          .study-v2-card-topline {
            padding: 0 9px;
          }

          .study-v2-card-actions {
            gap: 5px;
          }

          .study-v2-card-actions button {
            font-size: 14px;
            min-height: 34px;
            padding: 3px 5px;
          }

          .study-v2-card-actions .study-v2-context-action {
            font-size: 12px;
            padding: 5px 8px;
          }

          .study-v2-question-content {
            padding-left: 14px;
            padding-right: 14px;
          }

          .study-v2-question-content h1 {
            font-size: 28px;
          }

          .study-v2-modal-backdrop {
            padding: 7px;
          }

          .study-v2-concept-review-modal {
            max-height: calc(100dvh - 14px);
          }

          .study-v2-modal-footer button {
            flex: 1 1 auto;
          }
        }
      `}</style>
  );
}
