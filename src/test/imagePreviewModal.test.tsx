import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';
import ImagePreviewModal from '../components/media/ImagePreviewModal';

function renderBox(onClose: () => void) {
  return (
    <I18nextProvider i18n={i18n}>
      <ImagePreviewModal open src="/uploads/avatars/36-1.jpg" title="Luca Barbieri" caption="Employee" onClose={onClose} />
    </I18nextProvider>
  );
}

describe('ImagePreviewModal', () => {
  // Regression: the parent re-renders every few seconds (permission polling)
  // with a new onClose; that used to reset the fade-in and hide the photo.
  it('keeps the photo visible when the parent re-renders with a new onClose', () => {
    const { rerender } = render(renderBox(vi.fn()));
    const img = screen.getByAltText('Luca Barbieri') as HTMLImageElement;
    fireEvent.load(img);
    expect(img.style.opacity).toBe('1');

    rerender(renderBox(vi.fn()));
    rerender(renderBox(vi.fn()));
    expect((screen.getByAltText('Luca Barbieri') as HTMLImageElement).style.opacity).toBe('1');
  });

  it('closes on Escape, calling the latest onClose', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(renderBox(first));
    rerender(renderBox(latest));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
