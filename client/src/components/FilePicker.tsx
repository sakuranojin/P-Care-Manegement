import { useRef, useState } from 'react';
import type { Attachment } from '@shared/types';
import { uploadFile } from '../api';
import { IconClip, IconClose, IconFile } from './Icons';
import { useToast } from './ui';

/** Upload images / files and keep the resulting attachment list. */
export default function FilePicker({ value, onChange, label = 'ファイル・画像を添付' }: { value: Attachment[]; onChange: (v: Attachment[]) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const uploaded: Attachment[] = [];
      for (const f of Array.from(files)) uploaded.push(await uploadFile(f));
      onChange([...value, ...uploaded]);
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="file-picker">
      <button type="button" className="btn btn-sm btn-outline" onClick={() => ref.current?.click()} disabled={busy}>
        <IconClip size={16} />{busy ? 'アップロード中…' : label}
      </button>
      <input ref={ref} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
      {value.length > 0 && (
        <div className="fp-list">
          {value.map((a) => (
            <span key={a.url} className="fp-item">
              {a.type.startsWith('image/') ? <img src={a.url} alt="" /> : <IconFile size={16} />}
              <span>{a.name}</span>
              <button type="button" onClick={() => onChange(value.filter((x) => x.url !== a.url))} aria-label="削除"><IconClose size={14} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
