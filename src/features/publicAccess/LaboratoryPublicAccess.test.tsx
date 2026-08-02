import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LaboratoryPublicAccess } from './LaboratoryPublicAccess';

const downloadQrCodeAsJpeg = vi.hoisted(() => vi.fn());

vi.mock('./qrCodeDownload', () => ({
  downloadQrCodeAsJpeg,
}));

describe('LaboratoryPublicAccess', () => {
  beforeEach(() => {
    downloadQrCodeAsJpeg.mockReset();
  });

  it('mostra o QR Code e o link público canônico', () => {
    render(
      <LaboratoryPublicAccess
        laboratoryId="LAB01"
        laboratoryName="Laboratório de Informática"
        publicAppUrl="https://agenda.escola.edu.br/app/"
      />,
    );

    expect(
      screen.getByRole('img', { name: 'QR Code de acesso a Laboratório de Informática' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Link público de Laboratório de Informática' }),
    ).toHaveValue('https://agenda.escola.edu.br/app/#/?lab=LAB01');
  });

  it('abre a agenda pública sem compartilhar a janela de origem', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <LaboratoryPublicAccess
        laboratoryId="LAB01"
        laboratoryName="Laboratório de Informática"
        publicAppUrl="https://agenda.escola.edu.br/"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(open).toHaveBeenCalledWith(
      'https://agenda.escola.edu.br/#/?lab=LAB01',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });

  it('copia o link para a área de transferência', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText');
    render(
      <LaboratoryPublicAccess
        laboratoryId="LAB01"
        laboratoryName="Laboratório de Informática"
        publicAppUrl="https://agenda.escola.edu.br/"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Copiar link' }));

    expect(clipboardWrite).toHaveBeenCalledWith('https://agenda.escola.edu.br/#/?lab=LAB01');
    expect(screen.getByRole('status')).toHaveTextContent('Link copiado.');
    clipboardWrite.mockRestore();
  });

  it('baixa o SVG renderizado como um arquivo JPG de nome seguro', async () => {
    const user = userEvent.setup();
    downloadQrCodeAsJpeg.mockResolvedValue(undefined);
    render(
      <LaboratoryPublicAccess
        laboratoryId="LAB01"
        laboratoryName="Laboratório de Química / Sala 1"
        publicAppUrl="https://agenda.escola.edu.br/"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Baixar QR Code' }));

    expect(downloadQrCodeAsJpeg).toHaveBeenCalledWith(
      expect.any(SVGSVGElement),
      'qrcode-laboratorio-de-quimica-sala-1.jpg',
    );
    expect(await screen.findByRole('status')).toHaveTextContent('QR Code baixado em JPG.');
  });

  it('mostra uma falha de geração sem derrubar o painel', async () => {
    const user = userEvent.setup();
    downloadQrCodeAsJpeg.mockRejectedValue(new Error('Canvas indisponível'));
    render(
      <LaboratoryPublicAccess
        laboratoryId="LAB01"
        laboratoryName="Laboratório de Informática"
        publicAppUrl="https://agenda.escola.edu.br/"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Baixar QR Code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível gerar o JPG do QR Code.',
    );
    expect(screen.getByRole('button', { name: 'Baixar QR Code' })).toBeEnabled();
  });
});
