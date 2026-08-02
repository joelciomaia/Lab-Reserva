import { Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Button } from '../../components';
import styles from './LaboratoryPublicAccess.module.css';
import { buildLaboratoryPublicUrl } from './publicUrl';
import { downloadQrCodeAsJpeg } from './qrCodeDownload';
import { createQrCodeFileName } from './safeFileName';

export interface LaboratoryPublicAccessProps {
  laboratoryId: string;
  laboratoryName: string;
  publicAppUrl?: string;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.readOnly = true;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.append(textArea);
  textArea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('A cópia não foi autorizada pelo navegador.');
    }
  } finally {
    textArea.remove();
  }
}

export function LaboratoryPublicAccess({
  laboratoryId,
  laboratoryName,
  publicAppUrl,
}: LaboratoryPublicAccessProps) {
  const titleId = useId();
  const qrCodeContainerRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const publicUrl = useMemo(
    () =>
      buildLaboratoryPublicUrl(laboratoryId, publicAppUrl === undefined ? {} : { publicAppUrl }),
    [laboratoryId, publicAppUrl],
  );

  function openPublicSchedule() {
    setErrorMessage('');
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  }

  async function copyPublicUrl() {
    setErrorMessage('');
    setFeedback('');

    try {
      await copyText(publicUrl);
      setFeedback('Link copiado.');
    } catch {
      setErrorMessage('Não foi possível copiar o link. Selecione-o e copie manualmente.');
    }
  }

  async function downloadQrCode() {
    setErrorMessage('');
    setFeedback('');
    setIsDownloading(true);

    try {
      const svg = qrCodeContainerRef.current?.querySelector('svg');
      if (!svg) {
        throw new Error('QR Code indisponível.');
      }

      await downloadQrCodeAsJpeg(svg, createQrCodeFileName(laboratoryName));
      setFeedback('QR Code baixado em JPG.');
    } catch {
      setErrorMessage('Não foi possível gerar o JPG do QR Code. Tente novamente.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <QrCode size={22} />
        </span>
        <div>
          <h3 id={titleId}>Acesso público do laboratório</h3>
          <p>Compartilhe este link ou o QR Code com os professores.</p>
        </div>
      </header>

      <div className={styles.content}>
        <div ref={qrCodeContainerRef} className={styles.qrCode}>
          <QRCode
            value={publicUrl}
            bgColor="#ffffff"
            fgColor="#13364e"
            level="M"
            size={184}
            role="img"
            aria-label={`QR Code de acesso a ${laboratoryName}`}
          />
        </div>

        <div className={styles.linkArea}>
          <span className={styles.linkLabel}>Link da agenda</span>
          <input
            className={styles.linkInput}
            value={publicUrl}
            readOnly
            aria-label={`Link público de ${laboratoryName}`}
            onFocus={(event) => event.currentTarget.select()}
          />

          <div className={styles.actions}>
            <Button size="small" variant="secondary" onClick={openPublicSchedule}>
              <ExternalLink size={16} aria-hidden="true" />
              Abrir
            </Button>
            <Button size="small" variant="secondary" onClick={() => void copyPublicUrl()}>
              <Copy size={16} aria-hidden="true" />
              Copiar link
            </Button>
            <Button
              size="small"
              isLoading={isDownloading}
              loadingLabel="Gerando JPG…"
              onClick={() => void downloadQrCode()}
            >
              <Download size={16} aria-hidden="true" />
              Baixar QR Code
            </Button>
          </div>

          {feedback ? (
            <p className={styles.feedback} role="status">
              {feedback}
            </p>
          ) : null}
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
